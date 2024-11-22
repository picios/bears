import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

import { Configs } from "./lib/Configs.js";
import { ModelKeeper } from "./lib/ModelUtils.js";
import { DetectInputPrepperer, ClassifyImagePrepperer } from "./lib/ModelInput.js";
import { OutputProcessor, OutputAnalizer } from "./lib/ModelOutput.js";

// for testing only
const sleep = (time) => new Promise((resolve) => setTimeout(resolve, Math.ceil(time * 1000)));

function main() {
    const app = express();
    const upload = multer();

    const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
    const __dirname = path.dirname(__filename); // get the name of the directory

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

    app.get('/load_model', async function (req, res) {
        let modelKeeper = new ModelKeeper();
        await modelKeeper.load();
        res.json('{ status: "ok" }');
    });

    app.get('/info', (req, res) => {
        const data = {
            classes: Configs.classifyAll.classes,
            version: Configs.version,
            approach: Configs.approach,
        };
        res.json(data);
    });

    app.listen(8000, () => {
        console.log(`Server is listening on port 8000`)
    });
}

async function detect_objects_on_image(buf) {

    const classifyImagePrepperer = new ClassifyImagePrepperer();

    let outputs = await get_typed_detection(buf, 'detectAll', 'classifyAll');
    for (let ouput of outputs) {
        let allImg = await classifyImagePrepperer.get(buf, ouput.secondBox);
        let detectHead = await get_typed_detection(allImg, 'detectHead', 'classifyHead');
        //console.log('head', detectHead);
        ouput.setHead(detectHead);
    }

    //console.log(outputs);

    const analizer = new OutputAnalizer(outputs);
    const analized = analizer.getAnalized();
    //console.log('outputs', outputs);
    return analized;
};

async function get_typed_detection(buf, typeName, clsName) {
    const inputPrepperer = new DetectInputPrepperer();
    const outputProcessor = new OutputProcessor();
    const modelKepper = new ModelKeeper();

    let inputResult = await inputPrepperer.get(buf, typeName);
    let modelRun = await modelKepper.run(inputResult, typeName);
    let output = outputProcessor.proccessDetection(
        modelRun, 
        inputResult.getImageWidth(), 
        inputResult.getImageHeight(),
        typeName
    );

    const classifyImagePrepperer = new ClassifyImagePrepperer();

    for (let detecttion of output) {
        //console.log(detectHead);
        let headImg = await classifyImagePrepperer.get(buf, detecttion.box);
        let inputResult = await inputPrepperer.get(headImg, clsName);
        let modelClassyficationResult = await modelKepper.run(inputResult, clsName);
        let classyficationOutput = outputProcessor.processClassyfication(modelClassyficationResult, clsName)
        detecttion.addClassification(clsName, classyficationOutput);
    }

    for (let detecttion of output) {
        let wider = await classifyImagePrepperer.getWider(buf, detecttion.box);
        let inputResult = await inputPrepperer.get(wider.image, clsName);
        let modelClassyficationResult = await modelKepper.run(inputResult, clsName);
        //outputs['classifyHeadOnlyWider'].push(outputProcessor.processClassyfication(modelDetectionResults['classifyHead'], 'classifyHead'));
        let classyficationOutput = outputProcessor.processClassyfication(modelClassyficationResult, clsName);
        detecttion.addClassification(clsName + 'Wider', classyficationOutput);
        detecttion.setSecondBox(wider.box);
    }
    return output;
}

main();
