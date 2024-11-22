import ort from 'onnxruntime-node';
import { Configs } from "./Configs.js";

class ModelKeeper {
    static models = {
        detectAll: null,
        detectHead: null,
        classifyHead: null,
    }

    async load() {
        ModelKeeper.models.detectAll = await ort.InferenceSession.create(Configs.detectAll.path);
        ModelKeeper.models.classifyAll = await ort.InferenceSession.create(Configs.classifyAll.path);
        ModelKeeper.models.detectHead = await ort.InferenceSession.create(Configs.detectHead.path);
        ModelKeeper.models.classifyHead = await ort.InferenceSession.create(Configs.classifyHead.path);
    }

    async run(inputResult, typeName) {
        const config = Configs[typeName];
        //console.log('*', inputResult.getInput());
        const detectInputTensor = new ort.Tensor(Float32Array.from(inputResult.getInput()), [1, 3, config.imgSize, config.imgSize]);
        //console.log('tensor', detectInputTensor);
        const detectOutput = await ModelKeeper.models[typeName].run({ images: detectInputTensor });
        return detectOutput["output0"].data;
    }
}

export { 
    ModelKeeper
};