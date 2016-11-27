export interface Dictionary<T> {
    [K: string]: T;
}

export function guid():string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
}

export function getQueryVariable(variable:string):string {
    if(!window.location) return; //webworker
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
        }
    }
}

export function loadSvg(svgUrl:string):Promise<any>{
  return new Promise<any>((resolve, rejct)=>{
    Snap.load(svgUrl, resolve)
  }).then((svg)=>
    $('<div>').append(svg.node).children()[0]
  )
}

export function svgToCanvas(svgEl:HTMLElement):Promise<HTMLCanvasElement> {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  var image = new Image();
  var svg = $(svgEl)[0].outerHTML
  return new Promise<HTMLCanvasElement>((resolve, rejct)=>{
    image.onload = function load() {
        canvas.height = image.height;
        canvas.width = image.width;
        ctx.drawImage(image, 0, 0);
        resolve(canvas);
    };
    image.src = 'data:image/svg+xml;charset-utf-8,' + encodeURIComponent(svg);
  })
};

export function int(str:string, defaultNumber?:number):number {
    defaultNumber = _.isUndefined(defaultNumber) ? null : defaultNumber;
    let num = parseInt(str)
    return isNaN(num) ? defaultNumber : num
}

export function detectEnv():string {
    try {
        if (window.document === undefined) {
            return 'webworker'
        } else {
            return 'browser'
        }
    } catch (err){
        return 'node';
    }
}
