import { Configs } from "./Configs.js";

class OutputProcessor {
    proccessDetection(output, img_width, img_height, typeName) {
        let boxes = [];
        const config = Configs[typeName];
        //console.log('#', typeName, img_width, img_height, config.outputMultiplier);
        for (let index = 0; index < config.outputMultiplier; index++) {
            const [class_id, prob] = [...Array(16).keys()]
                .map(col => [col, output[config.outputMultiplier * (col + 4) + index]])
                .reduce((accum, item) => item[1] > accum[1] ? item : accum, [0, 0]);
            //console.log("@", class_id, prob);
            if (prob < 0.1) {
                continue;
            }
            const label = config.classes[class_id];
            const xc = output[index];
            const yc = output[config.outputMultiplier + index];
            const w = output[2 * config.outputMultiplier + index];
            const h = output[3 * config.outputMultiplier + index];
            const x1 = (xc - w / 2) / config.imgSize * img_width;
            const y1 = (yc - h / 2) / config.imgSize * img_height;
            const x2 = (xc + w / 2) / config.imgSize * img_width;
            const y2 = (yc + h / 2) / config.imgSize * img_height;
            boxes.push([x1, y1, x2, y2, label, prob]);
        }

        boxes = boxes.sort((box1, box2) => box2[5] - box1[5]);
        const cache = [];
        const labelsFound = [];
        const labelsCount = config.classes.length;
        const iou = new IntersectionOverUnion();
        while (boxes.length > 0) {
            let label = boxes[0][4];
            if (labelsCount === 1) {
                cache.push(boxes[0]);
            } else if (!labelsFound.includes(label)) {
                cache.push(boxes[0]);
                labelsFound.push(label);
            }
            boxes = boxes.filter(box => iou.iou(boxes[0], box) < 0.7);
        }
        //console.log(cache);
        const result = [];
        /*if (typeName == "detectHead") {
            console.log('heads', cache);
        }*/
        for (let cacheIndex in cache) {
            let box = cache[cacheIndex];
            let boundingBox = {
                x1: box[0] > 0 ? box[0] : 0.0, 
                y1: box[1] > 0 ? box[1] : 0.0, 
                x2: box[2] < img_width ? box[2] : img_width, 
                y2: box[3] < img_height ? box[3] : img_height
            }

            if (typeName == "detectAll") {
                result.push(new Silhouette(
                    box[4], 
                    box[5], 
                    boundingBox
                ));
            } else {
                result.push(new OutputItem(
                    box[4], 
                    box[5], 
                    boundingBox
                ));
            }
            
        }
        return this.orderOutputs(result);
    }

    processClassyfication(output, typeName) {
        const config = Configs[typeName];
        const result = [];
        config.classes.forEach((element, i) => {
            result.push(new OutputItem(element, output[i]));
        });
        return this.orderOutputs(result);
    }

    orderOutputs(sortable) {
        sortable.sort(function (a, b) {
            return b.getProbability() - a.getProbability();
        });
        return sortable;
    }
}

class OutputAnalizer {
    constructor(outputs) {
        this.outputs = outputs;
    }

    getAnalized() {
        //console.log(this.outputs[0].getHead());
        let pairs = this.pairAllWithHeads();
        return pairs;
        this.gather();
        return this.getNormalized();
    }

    pairAllWithHeads() {
        let objectsDetected = [];

        const iou = new IntersectionOverUnion();

        for (let oItem of this.outputs) {
            //console.log('head', oItem.head);
            if (oItem.label == 'bear') {
                objectsDetected.push(oItem);
            }
        }

        return {
            objects: objectsDetected,
        }
    }

    gather() {
        this.gather = {};
        this.gatherDetectAll();
        this.gatherDetectHead();
        this.gatherClassifyHead();
        //console.log(this.gather);
    }

    getNormalized() {
        let guesItems = [];
        for (let typeName in this.gather) {
            let typeGathers = this.gather[typeName];

            typeGathers.sort((typeGather1, typeGather2) => typeGather2.getWeight() - typeGather1.getWeight());
            let bestTypeGather = typeGathers[0];
            guesItems.push(new GuesItem(
                bestTypeGather.getLabel(),
                bestTypeGather.getWeight(),
                bestTypeGather.getProbability(),
                bestTypeGather.getTypeName(),
                typeGathers,
                bestTypeGather.getBox(),
            ));
        }
        guesItems.sort((typeGather1, typeGather2) => typeGather2.getProbability() - typeGather1.getProbability());
        guesItems.sort((typeGather1, typeGather2) => typeGather2.getWeight() - typeGather1.getWeight());
        return guesItems;
    }

    gatherDetectAll() {
        if (this.outputs["detectAll"].length === 0) {
            return;
        }
        //console.log('all', this.outputs["detectAll"]);
        for (let detection of this.outputs["detectAll"]) {
            // OutputItem: detection

            if (detection.getProbability() > 0.1) {
                this.addGatherItem(
                    detection.getLabel(),
                    detection.getProbability(),
                    "detectAll",
                    detection.getBox()
                );
            }
        }
    }

    gatherDetectHead() {
        if (this.outputs["detectHead"].length === 0) {
            return;
        }
        for (let detection of this.outputs["detectHead"]) {
            // OutputItem: detection
            if (detection.getProbability() > 0.2) {

                let classifications = detection.getClassifications();
                this.addGatherItem(
                    detection.getLabel(),
                    detection.getProbability(),
                    "detectHead",
                    detection.getBox(),
                    classifications
                );
                //console.log(detection.getClassifications());
                for (let classificationName in classifications) {
                    let box = classificationName == "headOnlyWider" ? detection.getSecondBox() : detection.getBox();
                    for (let classification of classifications[classificationName]) {
                        this.addGatherItem(
                            classification.getLabel(),
                            classification.getProbability(),
                            classificationName,
                            box
                        );
                    }
                }
            }
        }
    }

    gatherClassifyHead() {
        if (this.outputs["classifyHead"].length === 0) {
            return;
        }
        //console.log('head', this.outputs["classifyHead"]);
        for (let detection of this.outputs["classifyHead"]) {

            // OutputItem: detection
            if (detection.getProbability() > 0.01) {
                this.addGatherItem(
                    detection.getLabel(),
                    detection.getProbability(),
                    "classifyHead"
                );
            }
        }
    }

    addGatherItem(label, probability, typeName, box = []) {
        //console.log('label', label);
        if (label == "head") {
            return;
        }

        if (!(typeName in this.gather)) {
            this.gather[typeName] = [];
        }

        const weights = {
            classifyHead: 1.0,
            headOnly: 2.0,
            headOnlyWider: 1.4,
            detectAll: 0.8,
            detectHead: 1.0
        };

        let weight = 1.0;
        if (typeName in weights) {
            weight = probability * weights[typeName];
        }

        this.gather[typeName].push(new GatherItem(
            label,
            weight,
            probability,
            box,
            typeName
        ));
    }
}

class GatherItem {
    constructor(label, weight, probability, box, typeName) {
        this.label = label;
        this.weight = weight
        this.probability = parseFloat(probability.toFixed(2));
        this.box = box;
        this.typeName = typeName;
    }

    getLabel() {
        return this.label;
    }

    getWeight() {
        return this.weight;
    }

    getProbability() {
        return this.probability;
    }

    getBox() {
        return this.box;
    }

    getTypeName() {
        return this.typeName;
    }
}

class GuesItem {
    constructor(label, weight, probability, typeName, gathers, box) {
        this.label = label;
        this.weight = weight;
        this.probability = probability;
        this.typeName = typeName;
        this.gathers = gathers
        this.box = box;
    }

    getLabel() {
        return this.label;
    }

    getWeight() {
        return this.weight;
    }

    getProbability() {
        return this.probability;
    }

    getTypeName() {
        return this.typeName;
    }

    getBox() {
        return this.box;
    }

    getType() {
        return this.type;
    }
}

class OutputItem {
    constructor(label, probability, box = null) {
        this.label = label;
        this.probability = parseFloat(probability.toFixed(5));
        this.box = box;
        this.classifications = {};
    }

    getLabel() {
        return this.label;
    }

    getProbability() {
        return this.probability;
    }

    getBox() {
        return this.box;
    }

    addClassification(name, classification) {
        this.classifications[name] = classification;
    }

    getClassifications() {
        return this.classifications;
    }

    setSecondBox(secondBox) {
        this.secondBox = secondBox;
    }

    getSecondBox() {
        return this.secondBox;
    }
}

class Silhouette extends OutputItem {
    setHead(head) {
        this.head = head;
    }

    getHead() {
        return this.head;
    }
}

class IntersectionOverUnion {
    constructor() {

    }

    iou(box1, box2) {
        return this.intersection(box1, box2) / this.union(box1, box2);
    }

    union(box1, box2) {
        const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
        const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
        const box1_area = (box1_x2 - box1_x1) * (box1_y2 - box1_y1);
        const box2_area = (box2_x2 - box2_x1) * (box2_y2 - box2_y1);
        return box1_area + box2_area - this.intersection(box1, box2);
    }

    intersection(box1, box2) {
        const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
        const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
        const x1 = Math.max(box1_x1, box2_x1);
        const y1 = Math.max(box1_y1, box2_y1);
        const x2 = Math.min(box1_x2, box2_x2);
        const y2 = Math.min(box1_y2, box2_y2);
        return (x2 - x1) * (y2 - y1);
    }
}

export {
    OutputProcessor,
    OutputAnalizer
}