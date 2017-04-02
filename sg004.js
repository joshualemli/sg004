
'use strict'; // sg v002

var SG = (function(){ /* * * * * * * * * * *  define program  * * * * * * * * * * * */

    /*''''''''''' OCinDex ''''''''''''

    canvas <canvas>
    context <context2D>
    

    Timer (f(){
        start(<id-str>)
        elapsed(<id-str>)
    })()
    
    Space (f(){
        add(<uid-str>,<x-num>,<y-num>)
        remove(<uid-str>,<x-num>,<y-num>)
        move(<uid-str>,<xi-num>,<yi-num>,<xf-num>,<yf-num>)
        get(<x-num>,<y-num>,<searchRadius-int>,<maskUID-str>)
    })()

    DUNGEON (f(){
        spawn(<type-str>)
    })()

    entities {<uid-str>:<entity>,...}
    Player <entity>
    addEntity(<type-str>)
    removeEntity(<uid-str>)

    State {
        mode <mode-str>
        changeMode f(<mode-str>)
        loadState f()
        saveState f()
    }

    _step()
    _draw()
    _loop()
    swapGameState

    INIT()
    .................................*/
    var
    Timer,
    Space,
    State,
    entities = {},
    Player,
    canvas,
    context;

    Timer = (function(){
        var t = {};
        var rate = {};
        return {
            start: function(id) {t[id] = new Date().getTime();return t[id];},
            elapsed: function(id) {return new Date().getTime() - t[id];},
            rate: function(id,countMax) {
                if (rate[id]) {
                    var r = rate[id];
                    r.count += 1;
                    if (r.count === countMax) {
                        var ave = (new Date().getTime() - r.start)/r.count;
                        r.count = 0;
                        r.start = new Date().getTime();
                        return ave;
                    }
                }
                else rate[id] = {count:0,start:new Date().getTime()};
                return 0;
            }
        };
    })();

    Space = (function(){
        const binEdge = 40;
        var bin = {};
        function _hashDigit(n) {return String.fromCharCode(n+65);}
        function hash(a) {
            var str = '',sign=a<0?'n':'';
            if (a<0) a = -a;
            a = sign ? Math.ceil(a/binEdge) : Math.floor(a/binEdge) ;
            if (a) while(a){
                str = _hashDigit(a%10) + str;
                a = Math.floor(a/10);
            }
            else str = 'A';
            return sign+str;
        }
        function unhash(str) {
            var value = '', sign = 1;
            if (str[0]==='n') {
                str = str.substr(1);
                sign = -1;
            }
            for (var i = str.length; i--;) value = str.charCodeAt(i)-65 + value;
            return parseInt(value)*binEdge*sign;
        }
        function add_uid_to_bin(uid,X,Y) {
            if (bin[X]) {
                if (bin[X][Y]) return bin[X][Y].push(uid);
                else bin[X][Y] = [uid];
            }
            else {
                bin[X] = {};
                bin[X][Y] = [uid];
            }
            return bin[X][Y].length;
        }
        function _keyFetchesNull(k){return bin[k]===null;}
        function remove_uid_from_bin(uid,X,Y) {
            if (bin[X] && bin[X][Y] && bin[X][Y].length) {
                var index = bin[X][Y].indexOf(uid);
                if (index !== -1) {
                    bin[X][Y].splice(index,1);
                    if (bin[X][Y].length === 0) {
                        bin[X][Y] = null;
                        if (Object.keys(bin[X]).every(_keyFetchesNull)) bin[X] = null;
                    }
                }
            }
            else console.log('tried to remove UID from empty bin');
        }
        function xyGet_optRad_optMask(x,y,steps,maskUID) {
            var uids = [],X,Y;
            steps = Math.ceil((steps || binEdge) / binEdge);
            x -= steps*binEdge/2;
            y -= steps*binEdge/2;
            steps += 1;
            var xOrigin = x;
            for (var i = steps; i--;) {
                x = xOrigin;
                for (var j = steps; j--;) {
                    X = hash(x);
                    if (bin[X]) {
                        Y = hash(y);
                        if (bin[X][Y]) bin[X][Y].forEach(function(uid){uids.push(uid);});
                    }
                    x += binEdge;
                }
                y += binEdge;
            }
            if (maskUID) {
                var maskIndex = uids.indexOf(maskUID);
                if (maskIndex > -1) uids.splice(maskIndex,1);
            }
            return uids;
        }
        function uid_xy_to_xy(uid,xi,yi,xf,yf) {
            var Xi = hash(xi), Yi = hash(yi), Xf = hash(xf), Yf = hash(yf);
            if (Xi !== Xf || Yi !== Yf) {
                remove_uid_from_bin(uid,Xi,Yi);
                add_uid_to_bin(uid,Xf,Yf);
            }
        }
        function _drawBins() {
            context.strokeStyle = 'rgb(100,0,255)';
            context.lineWidth = 1;
            for (var X in bin) {
                if (bin[X]) for (var Y in bin[X]) {
                    if (bin[X][Y]) {
                        var x = unhash(X);
                        var y = unhash(Y);
                        context.strokeRect(x,y,binEdge,binEdge);
                    }
                }
            }
        }
        return {
            add:function(UID,x,y){add_uid_to_bin(UID,hash(x),hash(y));},
            remove:function(UID,x,y){remove_uid_from_bin(UID,hash(x),hash(y));},
            get:xyGet_optRad_optMask,
            move:uid_xy_to_xy,
            draw:_drawBins
        };
    })();

    var DUNGEON = (function() {

        function normalize(Dx,Dy,mag,preserveSmall) {
            if (!Dx && !Dy) return[0,0];
            var n = mag / Math.sqrt(Dx*Dx+Dy*Dy);
            return (preserveSmall && n>1) ? [Dx,Dy] : [Dx*n,Dy*n] ;
        }

        // macro functions

        function _grow() {
            this.size += this.static.baseGrowth;
        }
        function _move(dx,dy) {
            const xi = this.x;
            const yi = this.y;
            this.x += dx||this.dx;
            this.y += dy||this.dy;
            // CONSTRAIN
            if (this.x < 0) {this.x += context.canvas.width;}
            else if (this.x > context.canvas.width) {this.x -= context.canvas.width;}
            if (this.y < 0) {this.y += context.canvas.height;}
            else if (this.y > context.canvas.height) {this.y -= context.canvas.height;}
            // Space index
            Space.move(this.UID,xi,yi,this.x,this.y);
        }
        function _moveTo(xf,yf) {
            var d = normalize(xf - this.x, yf - this.y, this.static.baseSpeed);
            _move.call(this,d[0],d[1]);
        }

        function _flock() {
            var flock = Space.get(this.x,this.y,80,this.UID);
            var vec     = [0,0],
                vFlock  = [0,0],
                vAnti   = [0,0],
                vFollow = [0,0];
            for (var i = flock.length; i--;) {
                var p = entities[flock[i]];
                var Dx = p.x - this.x;
                var Dy = p.y - this.y;
                var D = Math.sqrt(Dx*Dx+Dy*Dy);
                var normMult = 1/D;
                vec = normalize(p.dx,p.dy,1);
                vFlock[0] += vec[0];
                vFlock[1] += vec[1];
                if (D < 20) {
//                     vec = [normMult*Dx,normMult*Dy];
                    vAnti[0] -= 1/Dx;//normMult*Dx;
                    vAnti[1] -= 1/Dy;//normMult*Dy;
                }
                if (D < 80) {
                    vFollow[0] += Dx;
                    vFollow[1] += Dy;
                }
            }
            vFlock = normalize(vFlock[0],vFlock[1],3);
            vAnti = normalize(vAnti[0],vAnti[1],2.3);
            vFollow = normalize(vFollow[0],vFollow[1],1);
            vec = normalize(vFlock[0]+vAnti[0]+vFollow[0],vFlock[1]+vAnti[1]+vFollow[1],this.static.baseAccel);
            vec = normalize(this.dx+vec[0],this.dy+vec[1],this.static.baseSpeed,true);
            this.dx = vec[0];
            this.dy = vec[1];
            _move.call(this);
            /*
            var vFlock = [0,0],
                vFollow = [0,0],
                vAnti = [0,0];
            var p,Dx,Dy,D;
            for (var i = flock.length; i--;) {
                p = entities[flock[i]];
                Dx = p.x - this.x;
                Dy = p.y - this.y;
                D = Math.sqrt(Dx*Dx+Dy*Dy);
                vFlock[0] += p.dx;
                vFlock[1] += p.dy;
                if (D < 8) {
                    vAnti[0] -= Dx/D;
                    vAnti[1] -= Dy/D;
                }
                else if (D < 100) {
                    vFollow[0] += Dx/D;
                    vFollow[1] += Dy/D;
                }
            }
            var vec = normalize(vAnti[0]+vFlock[0]+vFollow[0],vAnti[1]+vFlock[1]+vFollow[1],this.static.baseAccel);
            this.dx += vec[0];
            this.dy += vec[1];
            _move.call(this);
            */
            /*
            var vecFlock_X=0, vecFlock_Y=0,
                vecFollow_X=0, vecFollow_Y=0,
                vecAnti_X=0, vecAnti_Y=0;
            for (var i = flock.length; i--;) {
                var a = entities[flock[i]];
                var dx = a.x-this.x;
                var dy = a.y-this.y;
                var d = Math.sqrt(dx*dx+dy*dy);
                // if actual antiprox, get antiprox vecs...
                if (d < 30) {
                    vecAnti_X -= 1/dx;
                    vecAnti_Y -= 1/dy;
                }
                // ...else if actual flock, get flock vecs and follow vecs
                if (d > 20 && d < 80) {
                    vecFlock_X += a.dx;
                    vecFlock_Y += a.dy;
                    vecFollow_X += dx/(0.5*d*d);//dx*this.static.baseSpeed/d;
                    vecFollow_Y += dy/(0.5*d*d);//dy*this.static.baseSpeed/d;
                }
            }
            console.log(vecFlock_X,vecFollow_X,vecAnti_X);
            State.changeMode('asdf');
            var vec = normalize(vecFlock_X+vecFollow_X+vecAnti_X,vecFlock_Y+vecFollow_Y+vecAnti_Y,this.static.baseAccel);
            vec = normalize(vec[0]+this.dx,vec[1]+this.dy,this.static.baseSpeed,true);
            this.dx = vec[0];
            this.dy = vec[1];
            _move.call(this,vec[0],vec[1]);
            */
        }

        function ubiquitousProperties(radius,health,optional) {
            this.x = 0;
            this.y = 0;
            this.radius = radius||0;
            this.health = health||0;
            if (optional && typeof(optional)==='object') {
                if (optional.movement) {
                    this.dx = optional.movement.dx || 0;
                    this.dy = optional.movement.dy || 0;
                }
            }
        }

        // repositories

        var Entity = {};

        // entities

        Entity.Grass = function() {
            ubiquitousProperties.call(this,1,1);
        };
        Entity.Grass.prototype.static = {
            common: 'annual bluegrass',
            binom: 'Poa annua',
            baseGrowth: 0.0005
        };
        Entity.Grass.prototype.step = function() {
            _grow.call(this);
        };

        Entity.Ant = function() {
            ubiquitousProperties.call(this,1,1);
        };
        Entity.Ant.prototype.static = {
            common: 'red imported fire ant',
            binom: 'Solenopsis invicta',
            baseGrowth: 0.00005,
            baseMateChance: 0.001,
            baseSpeed: 1,
        };
        Entity.Ant.prototype.step = function() {
            _grow.call(this);
            _move.call(this);
        };

        Entity.Grasshopper = function() {
            ubiquitousProperties.call(this,2,2);
        };
        Entity.Grasshopper.prototype.static = {
            common: 'eastern lubber grasshopper',
            binom: 'Romalea guttata',
            baseGrowth:0.00015,
            baseMateChance: 0.01,
            baseSpeed:2
        };
        Entity.Grasshopper.prototype.step = function() {
            _grow.call(this);
            var dx = Math.random() < 0.5 ? -1 : 1;
            var dy = Math.random() < 0.5 ? -1 : 1;
            _move.call(this,dx,dy);
        };
        
        Entity.Sheep = function() {
            ubiquitousProperties.call(this,2,4,{movement:{}});
        };
        Entity.Sheep.prototype.static = {
            common: 'sheep',
            binom: 'Ovis aries',
            baseGrowth:0.00015,
            baseMateChance: 0.001,
            baseSpeed:1.2,
            baseAccel:0.07,
            flockRadius:100,
            flockEscapeProx:10
        };
        Entity.Sheep.prototype.step = function() {
            _grow.call(this);
            _flock.call(this);
        };
        
        
        
        // UID generator

        function _base52(n) {return String.fromCharCode(n>25?n+39:n+97);}
        function _randChar() {var n=Math.floor(Math.random()*52);return _base52(n);}
        function getUID() {
            var uid='', l=8;
            for (l;l--;) uid+=_randChar();
            return uid;
        }

        // public access
        return {
            spawn: function(type) {
                var entity = new Entity[type]();
                entity.UID = getUID();
                return entity;
            }
        };
    })();

    // world objects: entities repository, addEntity, removeEntity

    function addEntity(type) {
        var entity = DUNGEON.spawn(type);
        entities[entity.UID] = entity;
        return entity;
    }
    function removeEntity() {
    }

    // future home of load and save internal funcs
    State = {
        Game: {
        },
        mode: 'not_set', // gameplay, pause, ?stats, ?inventory, ?options
        changeMode: function(newMode) {
            if (State.mode === newMode) return console.log('new mode same as current mode');
            State.mode = newMode;
            switch(newMode) {
                case 'gameplay': _loop(); break;
                default: console.log('WARN: mode not found');
            }
        },
        loadState: function() {
        },
        saveState: function() {
        }
    };


    // gameplay: step, draw, and loop functions

    function _step() {
        for (var uid in entities) {
            var entity = entities[uid];
            entity.step();
        }
    }
    function _draw() {
        context.clearRect(0,0,context.canvas.width,context.canvas.height);
        for (var uid in entities) {
            var entity = entities[uid];
            context.fillStyle = 'rgb(0,0,0)';
            context.fillRect(entity.x,entity.y,entity.radius,entity.radius);
        }
        //debug BOUNDING BOXES
        //Space.draw();
    }
    function _loop() {
        Timer.start('loop');
        _step();
        _draw();
        // framerate and calc time
        var rate = Timer.rate('framerate',25);
        if (rate) document.getElementById('debug')
            .innerHTML = Math.round(1000/Math.round(rate))+'fps<br>'+Math.round(rate)+'ms/frame<br>'+ Timer.elapsed('loop')+'ms/loop';
        // loop
        if (State.mode === 'gameplay') setTimeout(_loop,33-Timer.elapsed('loop'));
    }

return function INIT(){ /* * * * * * * * *  initialize program  * * * * * * * * * */
    
    // renderer
    canvas = document.getElementById('canvas');
    context = canvas.getContext('2d');
    
    // game environment
    (function(){
        if (1) { // nothing to load --> generate by level or whatever (spoofed for now)
            var nEnt,_ent;
//             for (nEnt=100;nEnt--;) {
//                 _ent = addEntity('Grass');
//                 _ent.x = 50 + Math.random()*320;
//                 _ent.y = 50 + Math.random()*320;
//                 Space.add(_ent.UID,_ent.x,_ent.y);
//             }
            for (nEnt=250;nEnt--;) {
                _ent = addEntity('Sheep');
                _ent.x = 200 + Math.random()*300;
                _ent.y = 200 + Math.random()*300;
                Space.add(_ent.UID,_ent.x,_ent.y);
            }
        }
        else { // load data
        }
    })();

    // run environment
    (function(){
        
        function resizeCanvas() {
            context.canvas.width = canvas.offsetWidth;
            context.canvas.height = canvas.offsetHeight;
            _draw();
        }
        resizeCanvas();
        window.addEventListener('resize',resizeCanvas);
    })();
    
    State.changeMode('gameplay');

}})();window.onload = SG;

