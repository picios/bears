export class Configs {
    static version = "v1.2";
    static approach = "2";
    static detectAll = {
        imgSize: 512,
        outputMultiplier: 5376,
        path: "./models/d_bear.onnx",
        classes: [
            'bear',
        ]
    };

    static classifyAll = {
        imgSize: 224,
        path: "./models/c_bear.onnx",
        classes: [
            '128',
            '151',
            '164',
            '307',
            '32',
            '747',
            '856',
            '89',
            '903',
            '907',
            '909',
            '909j',
            '910',
            '910j',
        ]
    };

    static detectHead = {
        imgSize: 512,
        outputMultiplier: 5376,
        path: "./models/d_head.onnx",
        classes: [
            'head',
        ]
    };

    static classifyHead = {
        imgSize: 224,
        path: "./models/c_head.onnx",
        classes: [
            '128',
            '151',
            '164',
            '164shower',
            '307',
            '32',
            '747',
            '856',
            '89',
            '903',
            '907',
            '909',
            '909j',
            '910',
            '910j',
        ]
    };
}

export default Configs;