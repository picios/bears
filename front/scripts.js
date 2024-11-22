$("#uploadInput").on("change", (event) => {
    const data = new FormData();
    data.append("image_file", event.target.files[0], "image_file");
    const painter = new Painter();
    painter.showWaiter();

    let progress = $("#progress");
    let progressBar = $("#progress-bar");
    var request = new XMLHttpRequest();
    request.upload.onloadstart = function () {
        progress.removeClass("invisible").addClass("visible");
        progressBar.width("1%");
    }

    request.upload.onprogress = function (event) {
        if (event.lengthComputable) {
            var complete = (event.loaded / event.total * 100 | 0);
            progressBar.width( complete + '%' );
        }
    };

    request.onreadystatechange = function () {
        if (request.readyState === XMLHttpRequest.DONE) {
            const status = request.status;
            if (status === 0 || (status >= 200 && status < 400)) {
                // The request has been completed successfully
                const boxes = JSON.parse(request.responseText);
                painter.clear();
                if (boxes.length === 0) {
                    painter.addNoPrediction(event.target.files[0]);
                } else {
                    progress.animate({ opacity: 0 }, 1000, function() {
                        progress.removeClass("visible").addClass("invisible");
                        progress.css('opacity', 1.0);
                        progressBar.width("1%");
                    });
                    
                    const preprocessor = new Preprocessor();
                    const classyficationItems = preprocessor.getClassyficationItems(boxes);
                    painter.draw(event.target.files[0], classyficationItems);
                }
            } else {
                // Oh no! There has been an error with the request!
            }
        }
    };
    request.open('post', '/detect');
    request.timeout = 45000;
    request.send(data);

    /*
        const response = await fetch("/detect", {
            method: "post",
            body: data
        });
        const boxes = await response.json();
    */

});

window.addEventListener("load", async (event) => {
    const response = await fetch("/info", {
        method: "get"
    });
    const info = await response.json();
    const classes = info.classes;
    const classesBox = document.getElementById('trained-classes');
    for (let className of classes) {
        let li = document.createElement('li');
        li.innerHTML = className;
        classesBox.appendChild(li);
    }

    document.getElementById("model-version").innerHTML = info.version;
    document.getElementById("approach").innerHTML = info.approach;

    // load model and remove dimmer
    const load_model_rsp = await fetch("/load_model", {
        method: "get"
    });
    const status = await load_model_rsp.json();
    document.getElementById("dimmer").remove();
});

class Preprocessor {
    getClassyficationItems(boxes) {
        const classyficationItems = [];

        const bears = [];

        boxes.objects.forEach((oItem) => {

            let bear = new Bear();

            let clsAll = oItem.classifications.classifyAll[0];
            bear.setAll(new BearClassyficationItem(
                clsAll.label,
                oItem.box,
                clsAll.probability,
                oItem.classifications.classifyAll
            ));

            let clsAllWider = oItem.classifications.classifyAllWider[0];
            bear.setAllWider(new BearClassyficationItem(
                clsAllWider.label,
                oItem.secondBox,
                clsAllWider.probability,
                oItem.classifications.classifyAllWider
            ));

            // head
            if (oItem.head[0] !== undefined) {
                let clsHead = oItem.head[0].classifications.classifyHead[0];
                bear.setHead(new BearClassyficationItem(
                    clsHead.label,
                    oItem.head[0].box,
                    clsHead.probability,
                    oItem.head[0].classifications.classifyHead
                ));

                let clsHeadWider = oItem.head[0].classifications.classifyHeadWider[0];
                bear.setHeadWider(new BearClassyficationItem(
                    clsHeadWider.label,
                    oItem.head[0].secondBox,
                    clsHeadWider.probability,
                    oItem.head[0].classifications.classifyHeadWider
                ));
            }

            bear.calculate();
            bears.push(bear);
            //console.log('bear', bear);
        });

        let indexed = {};
        bears.forEach((bear) => {
            let label = bear.getWeightedLabel();
            //if (!(label in indexed) || ((label in indexed) && indexed[label].getWeight() < bear.getWeight())) {
                indexed[label] = bear;
            //}
        });
        //console.log(indexed);
        let result = [];
        for (const [label, bear] of Object.entries(indexed)) {
            result.push(bear);
        }
        //console.log(bears);
        //classyficationItems.sort((ci1, ci2) => ci2.weight - ci1.weight);
        return result;
    }
}

class Painter {
    showWaiter() {
        const waiter = document.createElement('div');
        waiter.innerHTML = '<div class="alert">Loading... Please wait</div>';
        const imageBox = document.getElementById("predicted-image");
        imageBox.innerHTML = "";
        imageBox.appendChild(waiter)
    }

    draw(file, classyficationItems) {
        const scope = this;
        const img = new Image()
        img.src = URL.createObjectURL(file);
        const predictedImageBox = document.getElementById('predicted-image');
        let labels = [];
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            ctx.lineWidth = 3;

            let counter = 1;
            classyficationItems.forEach((clsItem) => {
                //console.log('cls', clsItem);
                let color = '#ff0';

                ctx.strokeStyle = color;

                let box = clsItem.getAllBox()
                ctx.strokeRect(
                    box.x1,
                    box.y1,
                    box.x2 - box.x1,
                    box.y2 - box.y1
                );

                if (clsItem.getHeadBox()) {
                    let headBox = clsItem.getHeadBox()
                    color = '#f00';
                    ctx.strokeStyle = color;
                    ctx.strokeRect(
                        box.x1 + headBox.x1,
                        box.y1 + headBox.y1,
                        headBox.x2 - headBox.x1,
                        headBox.y2 - headBox.y1
                    );
                }

                labels.push(clsItem.getWeightedLabel());
                /*if (counter === 2) {
                    isMain = false;
                    scope.addOthersLabel();
                }*/

                scope.addPrediction(img, clsItem);
                counter++;
            });
            scope.addMainLabel(labels.join(', '));

            let predictedImage = document.createElement("img");
            predictedImage.setAttribute('src', canvas.toDataURL('image/jpeg'));
            predictedImageBox.appendChild(predictedImage);
        }
    }

    addNoPrediction(file) {
        const src = URL.createObjectURL(file);
        let image = document.createElement('img');
        image.setAttribute("src", src);
        const predictedImageBox = document.getElementById('predicted-image');
        predictedImageBox.appendChild(image);

        const labelsCt = document.getElementById("labels-ct");

        let labelBox = document.createElement('div');
        labelBox.className = 'label no-prediction';
        labelBox.innerHTML = 'No prediction found. Sorry';

        let prediction = document.createElement('div');
        prediction.className = 'alert alert-danger';
        prediction.appendChild(labelBox);

        labelsCt.appendChild(prediction);
    }

    addMainLabel(label) {
        const labelsCt = document.getElementById("labels-ct");

        let labelBox = document.createElement('h5');
        labelBox.className = 'label mb-3';
        labelBox.innerHTML = 'My type is <strong>' + label + '</strong>';

        labelsCt.prepend(labelBox);
    }

    addOthersLabel() {
        const labelsCt = document.getElementById("labels-ct");

        let labelBox = document.createElement('h5');
        labelBox.className = 'label other-predictions';
        labelBox.innerHTML = 'I was also thinking ...';

        labelsCt.appendChild(labelBox);
    }

    addPrediction(img, clsItem) {
        const scope = this;
        const labelsCt = document.getElementById("labels-ct");

        let ct = document.createElement('div');
        ct.className = 'card prediction mb-3';
        ct.setAttribute('data-bs-theme', 'light');

        let body = document.createElement('div');
        body.className = 'card-body';

        const image = document.createElement('img');
        image.className = "card-img-top";
        const url = this.#copyCropped(img, clsItem.getAllBox());
        image.setAttribute("src", url);
        ct.appendChild(image);

        let labelBox = document.createElement('h5');
        labelBox.className = 'card-title';
        labelBox.innerHTML = 'Bear Id: ' + clsItem.getWeightedLabel();

        let row = document.createElement('div');
        row.className = 'row';

        let col1 = document.createElement('div');
        col1.className = 'col-sm-4';

        let col2 = document.createElement('div');
        col2.className = 'col-sm';

        let headBox = document.createElement('div');
        if (clsItem.getHeadBox() !== null) {
            headBox.className = 'image-box head';
            const vimage = new Image();
            vimage.onload = function () {
                //const imageHead = document.createElement('img');
                const urlHead = scope.#copyCropped(vimage, clsItem.getHeadBox());
                //imageHead.setAttribute("src", urlHead);
                headBox.style.setProperty('background-image', 'url(' + urlHead + ')');

            };
            vimage.src = url;
        }

        let weightBox = document.createElement('div');
        weightBox.className = 'weight-x';
        weightBox.innerHTML = '<span class="text-muted text-uppercase fw-lighter label">Weight:</span> <span class="fw-bold value">' + clsItem.getWeight().toFixed(2) + '</span>';

        let accuBox = document.createElement('div');
        accuBox.className = 'accu-x';
        accuBox.innerHTML = '<span class="text-muted text-uppercase fw-lighter label">Confidence:</span> <span class="fw-bold value">' + clsItem.getProbability().toFixed(2) + '</span>';

        let typeBox = document.createElement('div');
        typeBox.className = 'clstype-x';
        typeBox.innerHTML = '<span class="text-muted text-uppercase fw-lighter label">Test:</span> <span class="fw-bold value">whole body</span>';

        let clssBox = document.createElement('div');
        typeBox.className = 'clss-x';
        typeBox.innerHTML = '<span class="text-muted text-uppercase fw-lighter label">Guesses:</span>';

        let parts = [];
        parts.push('<span class="fw-bold value">');
        let isLetter = false;
        for (let cls of clsItem.getClassyfications()) {
            let className = isLetter ? ' text-muted fw-normal' : '';
            parts.push('<div class="gues' + className + '">' + cls.label + ' (' + cls.probability.toFixed(2) + ')</div>');
            isLetter = true;
        }
        parts.push('</span>');
        typeBox.innerHTML += parts.join("\n");

        col1.appendChild(headBox);
        body.appendChild(labelBox);
        col2.appendChild(weightBox);
        col2.appendChild(accuBox);
        col2.appendChild(typeBox);
        row.appendChild(col1);
        row.appendChild(col2);
        body.appendChild(row);
        ct.appendChild(body);

        labelsCt.appendChild(ct);
    }

    #copyCropped(image, rect) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = rect.x2 - rect.x1;
        canvas.height = rect.y2 - rect.y1;;
        context.drawImage(image, rect.x1, rect.y1, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg');
    }

    clear() {
        const imageBox = document.getElementById("predicted-image");
        imageBox.innerHTML = "";

        const labelsCt = document.getElementById("labels-ct");
        labelsCt.innerHTML = "";
    }
}

class ClassyficationItem {
    constructor(dtcType, clsType, box, label, probability, weight) {
        this.dtcType = dtcType;
        this.clsType = clsType;
        this.box = box;
        this.label = label;
        this.probability = probability;
        this.weight = weight;
    }
}

class Bear {
    constructor() {
        this.all = null;
        this.allWider = null;
        this.head = null;
        this.headWider = null;

        this.calcs = {
            weight: 0.0,
            label: '',
            probability: 0.0,
            classyfications: []
        };
    }

    getAll() {
        return this.all;
    }

    setAll(x) {
        x.weight = 0.8 * x.probability;
        this.all = x;
    }

    getAllWider() {
        return this.allWider;
    }

    setAllWider(x) {
        x.weight = 1 * x.probability;
        this.allWider = x;
    }

    getHead() {
        return this.head;
    }

    setHead(x) {
        x.weight = 1.8 * x.probability;
        this.head = x;
    }

    getHeadWider() {
        return this.headWider;
    }

    setHeadWider(x) {
        x.weight = 1.5 * x.probability;
        this.headWider = x;
    }

    getWeightedLabel() {
        return this.calcs.label;
    }

    getProbability() {
        return this.calcs.probability
    }

    getWeight() {
        return this.calcs.weight;
    }

    getClassyfications() {
        return this.calcs.classyfications;
    }

    getAllBox() {
        return this.getAllWider().getBox();
    }

    getHeadBox() {
        if (this.getHeadWider() === null) {
            return null;
        }
        return this.getHeadWider().getBox();
    }

    #getWeights() {
        return {
            all: 0.8,
            allWider: 1,
            head: 1.8,
            headWider: 1.5,
        };
    }

    calculate() {
        const weights = this.#getWeights();

        let labels = {};
        for (let weightName in weights) {
            let cls = this[weightName];
            if (cls === null) {
                continue;
            }
            for (let cls of this[weightName].classifications) {
                if (!(cls.label in labels)) {
                    labels[cls.label] = {
                        weight: 0.0,
                        probability: 0.0
                    };
                }
                labels[cls.label].weight += cls.probability * weights[weightName];
                labels[cls.label].probability = cls.probability > labels[cls.label].probability ? cls.probability : labels[cls.label].probability;
            }
        }

        let labelsAsArray = [];
        for (let label in labels) {
            let item = labels[label];
            labelsAsArray.push({
                label: label,
                probability: item.probability,
                weight: item.weight
            });
        }

        labelsAsArray.sort((obj1, obj2) => obj2.weight > obj1.weight);
        let topGuess = labelsAsArray[0];
        this.calcs.classyfications = labelsAsArray.filter(obj => obj.probability > 0.2);
        this.calcs.label = topGuess.label;
        this.calcs.weight = topGuess.weight;
        this.calcs.probability = topGuess.probability;
    }
}

class BearClassyficationItem {
    constructor(label, box, probability, classifications) {
        this.label = label;
        this.box = box;
        this.probability = probability;
        this.classifications = classifications;
    }

    getLabel() {
        return this.label;
    }

    setLabel(x) {
        this.label = x;
        return this;
    }

    getBox() {
        return this.box;
    }

    setBox(x) {
        this.box = x;
        return this;
    }

    getProbability() {
        return this.probability;
    }

    setProbability(x) {
        this.probability = x;
        return this;
    }

    getClassyfications() {
        return this.classifications;
    }

    setClassyfications(x) {
        this.classifications = x;
        return this;
    }
}