const ort = require("onnxruntime-node");
const express = require('express');
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
var path = require('path');
const imgSize = 512;
const outputMultiplier = 5376;

function main() {
    const app = express();
    const upload = multer();

    app.use(express.static(path.join(__dirname, 'public')));
    app.use("/front/bootstrap/css", express.static(path.join(__dirname, "node_modules/bootstrap/dist/css")));
    app.use("/front/bootstrap/js", express.static(path.join(__dirname, "node_modules/bootstrap/dist/js")));
    app.use("/front/", express.static(path.join(__dirname, "front")));

    app.get("/", (req, res) => {
        res.end(fs.readFileSync("index.html", "utf8"))
    })

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

async function detect_objects_on_image(buf) {
    const [input, img_width, img_height] = await prepare_input(buf);
    const output = await run_model(input);
    return process_output(output, img_width, img_height);
}

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

async function run_model(input) {
    const model = await ort.InferenceSession.create("yolov8m.onnx");
    input = new ort.Tensor(Float32Array.from(input), [1, 3, imgSize, imgSize]);
    const outputs = await model.run({ images: input });
    //console.log(outputs);
    return outputs["output0"].data;
}

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

function iou(box1, box2) {
    return intersection(box1, box2) / union(box1, box2);
}

function union(box1, box2) {
    const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
    const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
    const box1_area = (box1_x2 - box1_x1) * (box1_y2 - box1_y1)
    const box2_area = (box2_x2 - box2_x1) * (box2_y2 - box2_y1)
    return box1_area + box2_area - intersection(box1, box2)
}

function intersection(box1, box2) {
    const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
    const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
    const x1 = Math.max(box1_x1, box2_x1);
    const y1 = Math.max(box1_y1, box2_y1);
    const x2 = Math.min(box1_x2, box2_x2);
    const y2 = Math.min(box1_y2, box2_y2);
    return (x2 - x1) * (y2 - y1)
}

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
