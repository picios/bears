import sharp from 'sharp';
import { Configs } from "./Configs.js";

class InputPrepperer {
    async prepare(sharpImage, imgSize) {
        const pixels = await sharpImage
            .removeAlpha()
            .resize({ width: imgSize, height: imgSize, fit: 'fill' })
            .raw()
            .toBuffer();
        const red = [], green = [], blue = [];
        for (let index = 0; index < pixels.length; index += 3) {
            red.push(pixels[index] / 255.0);
            green.push(pixels[index + 1] / 255.0);
            blue.push(pixels[index + 2] / 255.0);
        }
        return [...red, ...green, ...blue];
    }
}

class DetectInputPrepperer extends InputPrepperer {
    async get(buf, typeName) {
        const img = sharp(buf);
        const md = await img.metadata();
        const [img_width, img_height] = [md.width, md.height];
        const detectInput = await this.prepare(img, Configs[typeName].imgSize);

        return new InputResult(
            detectInput,
            img_width,
            img_height
        );
    }
}

class ClassifyImagePrepperer extends InputPrepperer {
    async get(buf, box) {
        //console.log('box', box);
        const sharpImage = sharp(buf);
        const md = await sharpImage.metadata();
        const [img_width, img_height] = [md.width, md.height];

        return await sharpImage
            .extract({ width: parseInt(box.x2-box.x1), height: parseInt(box.y2-box.y1), left: parseInt(box.x1), top: parseInt(box.y1)  })
            .toBuffer()
        ;
    }

    async getWider(buf, box) {
        //console.log('box', box);
        const sharpImage = sharp(buf);
        const md = await sharpImage.metadata();
        const [img_width, img_height] = [md.width, md.height];

        const crop_width = box.x2 - box.x1;
        const crop_height = box.y2 - box.y1;
        const avarage = (crop_width + crop_height) / 2;

        const magnifier = avarage * 0.1;

        const widerBox = {
            x1: parseInt(box.x1 - magnifier),
            y1: parseInt(box.y1 - magnifier),
            x2: parseInt(box.x2 + magnifier),
            y2: parseInt(box.y2 + magnifier)
        };
        if (widerBox.x1 < 0) {
            widerBox.x1 = 0;
        }
        if (widerBox.y1 < 0) {
            widerBox.y1 = 0;
        }
        if (widerBox.x2 > img_width) {
            widerBox.x2 = img_width;
        }
        if (widerBox.y2 > img_height) {
            widerBox.y2 = img_height;
        }

        const newBuffer = await sharpImage
            .extract({ 
                width: widerBox.x2-widerBox.x1, 
                height: widerBox.y2-widerBox.y1, 
                left: widerBox.x1, 
                top: widerBox.y1  
            })
            .toBuffer()
        ;

        return {
            image: newBuffer,
            box: widerBox
        };
    }
}

class InputResult {
    constructor(input, img_width, img_height) {
        this.input = input;
        this.img_width = img_width;
        this.img_height = img_height;
    }

    getInput() {
        return this.input;
    }

    getImageWidth() {
        return this.img_width;
    }

    getImageHeight() {
        return this.img_height;
    }
}

export {
    DetectInputPrepperer,
    ClassifyImagePrepperer,
    InputResult
}