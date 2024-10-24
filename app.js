const ort = require("onnxruntime-node");
const express = require('express');
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
var path = require('path');
const imgSize = 512;
const outputMultiplier = 5376;
/**
 * Main function that setups and starts a
 * web server on port 8080
 */
function main() {
    const app = express();
    const upload = multer();

    app.use(express.static(path.join(__dirname, 'public')));
    app.use("/front/bootstrap/css", express.static(path.join(__dirname, "node_modules/bootstrap/dist/css")));
    app.use("/front/bootstrap/js", express.static(path.join(__dirname, "node_modules/bootstrap/dist/js")));
    app.use("/front/", express.static(path.join(__dirname, "front")));
    /**
     * The site root handler. Returns content of index.html file.
     */
    app.get("/", (req, res) => {
        res.end(fs.readFileSync("index.html", "utf8"))
    })

    /**
     * The handler of /detect endpoint that receives uploaded
     * image file, passes it through YOLOv8 object detection network and returns
     * an array of bounding boxes in format [[x1,y1,x2,y2,object_type,probability],..] as a JSON
     */
    app.post('/detect', upload.single('image_file'), async function (req, res) {
        const boxes = await detect_objects_on_image(req.file.buffer);
        res.json(boxes);
    });

    app.get('/info', (req, res) => {
        const data = {
            classes: yolo_classes,
            version: version,
            approach: approach,
        };
        res.json(data);
    });

    app.listen(8000, () => {
        console.log(`Server is listening on port 8000`)
    });
}

/**
 * Function receives an image, passes it through YOLOv8 neural network
 * and returns an array of detected objects and their bounding boxes
 * @param buf Input image body
 * @returns Array of bounding boxes in format [[x1,y1,x2,y2,object_type,probability],..]
 */
async function detect_objects_on_image(buf) {
    const [input, img_width, img_height] = await prepare_input(buf);
    const output = await run_model(input);
    return process_output(output, img_width, img_height);
}

/**
 * Function used to convert input image to tensor,
 * required as an input to YOLOv8 object detection
 * network.
 * @param buf Content of uploaded file
 * @returns Array of pixels
 */
async function prepare_input(buf) {
    const img = sharp(buf);
    const md = await img.metadata();
    const [img_width, img_height] = [md.width, md.height];
    const pixels = await img.removeAlpha()
        .resize({ width: imgSize, height: imgSize, fit: 'fill' })
        .raw()
        .toBuffer();
    const red = [], green = [], blue = [];
    for (let index = 0; index < pixels.length; index += 3) {
        red.push(pixels[index] / 255.0);
        green.push(pixels[index + 1] / 255.0);
        blue.push(pixels[index + 2] / 255.0);
    }
    const input = [...red, ...green, ...blue];
    return [input, img_width, img_height];
}

/**
 * Function used to pass provided input tensor to YOLOv8 neural network and return result
 * @param input Input pixels array
 * @returns Raw output of neural network as a flat array of numbers
 */
async function run_model(input) {
    const model = await ort.InferenceSession.create("front/yolov8m.onnx");
    input = new ort.Tensor(Float32Array.from(input), [1, 3, imgSize, imgSize]);
    const outputs = await model.run({ images: input });
    //console.log(outputs);
    return outputs["output0"].data;
}

/**
 * Function used to convert RAW output from YOLOv8 to an array of detected objects.
 * Each object contain the bounding box of this object, the type of object and the probability
 * @param output Raw output of YOLOv8 network
 * @param img_width Width of original image
 * @param img_height Height of original image
 * @returns Array of detected objects in a format [[x1,y1,x2,y2,object_type,probability],..]
 */
function process_output(output, img_width, img_height) {
    let boxes = [];
    for (let index = 0; index < outputMultiplier; index++) {
        const [class_id, prob] = [...Array(80).keys()]
            .map(col => [col, output[outputMultiplier * (col + 4) + index]])
            .reduce((accum, item) => item[1] > accum[1] ? item : accum, [0, 0]);
        if (prob < 0.3) {
            continue;
        }
        const label = yolo_classes[class_id];
        const xc = output[index];
        const yc = output[outputMultiplier + index];
        const w = output[2 * outputMultiplier + index];
        const h = output[3 * outputMultiplier + index];
        const x1 = (xc - w / 2) / imgSize * img_width;
        const y1 = (yc - h / 2) / imgSize * img_height;
        const x2 = (xc + w / 2) / imgSize * img_width;
        const y2 = (yc + h / 2) / imgSize * img_height;
        boxes.push([x1, y1, x2, y2, label, prob]);
    }
    //console.log(boxes);
    boxes = boxes.sort((box1, box2) => box2[5] - box1[5])
    const result = [];
    const labelsFound = [];
    while (boxes.length > 0) {
        let label = boxes[0][4];
        if (!labelsFound.includes(label)) {
            result.push(boxes[0]);
            labelsFound.push(label);
        }
        boxes = boxes.filter(box => iou(boxes[0], box) < 0.7);
    }
    return result;
}

/**
 * Function calculates "Intersection-over-union" coefficient for specified two boxes
 * https://pyimagesearch.com/2016/11/07/intersection-over-union-iou-for-object-detection/.
 * @param box1 First box in format: [x1,y1,x2,y2,object_class,probability]
 * @param box2 Second box in format: [x1,y1,x2,y2,object_class,probability]
 * @returns Intersection over union ratio as a float number
 */
function iou(box1, box2) {
    return intersection(box1, box2) / union(box1, box2);
}

/**
 * Function calculates union area of two boxes.
 *     :param box1: First box in format [x1,y1,x2,y2,object_class,probability]
 *     :param box2: Second box in format [x1,y1,x2,y2,object_class,probability]
 *     :return: Area of the boxes union as a float number
 * @param box1 First box in format [x1,y1,x2,y2,object_class,probability]
 * @param box2 Second box in format [x1,y1,x2,y2,object_class,probability]
 * @returns Area of the boxes union as a float number
 */
function union(box1, box2) {
    const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
    const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
    const box1_area = (box1_x2 - box1_x1) * (box1_y2 - box1_y1)
    const box2_area = (box2_x2 - box2_x1) * (box2_y2 - box2_y1)
    return box1_area + box2_area - intersection(box1, box2)
}

/**
 * Function calculates intersection area of two boxes
 * @param box1 First box in format [x1,y1,x2,y2,object_class,probability]
 * @param box2 Second box in format [x1,y1,x2,y2,object_class,probability]
 * @returns Area of intersection of the boxes as a float number
 */
function intersection(box1, box2) {
    const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
    const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
    const x1 = Math.max(box1_x1, box2_x1);
    const y1 = Math.max(box1_y1, box2_y1);
    const x2 = Math.min(box1_x2, box2_x2);
    const y2 = Math.min(box1_y2, box2_y2);
    return (x2 - x1) * (y2 - y1)
}

/**
 * Array of YOLOv8 class labels
 */
const yolo_classes = [
    '128',
    '151',
    '164',
    '164shower',
    '307',
    '32',
    '747',
    '856',
    '903',
    '907',
    '909',
    '909j',
    '910',
    '910j',
];

const version = "v1.0";
const approach = "1";

main()
