import MapOverlay from '../effects/MapOverlay';
import GameState from '../states/GameState';
import { IKeymap } from '../data/Keymap';
import Constants from '../data/Constants';
import Hud from '../gui/Hud';
import Dialog from '../gui/Dialog';
import Entity from '../entities/Entity';

export default class Level extends GameState {
    // key for the level data
    levelKey: string = '';

    // the reference to the tiled map
    tiledmap: Phaser.Plugin.Tiled.Tilemap = null;

    // layer and zone tracking
    activeZone: Phaser.Plugin.Tiled.ITiledObject = null;
    oldZone: Phaser.Plugin.Tiled.ITiledObject = null;

    oldLayer: Phaser.Plugin.Tiled.Objectlayer = null;
    oldLayerOverlay: Phaser.Plugin.Tiled.Objectlayer = null;

    activeLayer: Phaser.Plugin.Tiled.Objectlayer = null;
    activeLayerOverlay: Phaser.Plugin.Tiled.Objectlayer = null;

    // ambient music
    music: Phaser.Sound = null;

    // misc sprites used for map effects
    overlay: MapOverlay = null;

    dialog: Dialog = null;
    hud: Hud = null;

    keymap: IKeymap = {
        keyboard: {
            up:         Phaser.Keyboard.W,
            down:       Phaser.Keyboard.S,
            left:       Phaser.Keyboard.A,
            right:      Phaser.Keyboard.D,

            use:        Phaser.Keyboard.E,
            useItem:    Phaser.Keyboard.V,
            attack:     Phaser.Keyboard.SPACEBAR,

            menuSave:   Phaser.Keyboard.B,
            menuMap:    Phaser.Keyboard.M,
            menuInv:    Phaser.Keyboard.I,
        },
        gamepad: {
            up:         Phaser.Gamepad.XBOX360_DPAD_UP,
            down:       Phaser.Gamepad.XBOX360_DPAD_DOWN,
            left:       Phaser.Gamepad.XBOX360_DPAD_LEFT,
            right:      Phaser.Gamepad.XBOX360_DPAD_RIGHT,

            use:        Phaser.Gamepad.XBOX360_A,
            useItem:    Phaser.Gamepad.XBOX360_Y,
            attack:     Phaser.Gamepad.XBOX360_B,

            menuSave:   Phaser.Gamepad.XBOX360_BACK,
            menuMap:    Phaser.Gamepad.XBOX360_X,
            menuInv:    Phaser.Gamepad.XBOX360_START,
        },
    };

    // flag whether the zone load
    private _firstZone: boolean = true;

    // the data loaded for this level in its pack
    private _packData: any = null;

    private _tempVector: Phaser.Point = new Phaser.Point();

    // private _bgtx: Phaser.RenderTexture = null;
    // private _bgspr: Phaser.Sprite = null;

    private _cameraBounds: Phaser.Rectangle;

    private _paused: boolean = false;

    preload() {
        super.preload();

        // should be loaded by the preloader state
        this._packData = this.cache.getJSON(Constants.ASSET_TILEMAP_PACKS_KEY);

        this.load.pack(this.levelKey, null, this._packData);
    }

    create() {
        super.create();

        this.overlay = this.add.existing(new MapOverlay(this.game));

        this._cameraBounds = new Phaser.Rectangle(0, 0, 0, 0);

        this.dialog = this.add.existing(new Dialog(this.game, null, true, false));
        this.dialog.fixedToCamera = true;
        this.dialog.cameraOffset.set(34, 146);

        this.hud = this.add.existing(new Hud(this.game));
        this.hud.fixedToCamera = true;
        this.hud.cameraOffset.set(0, 0);

        // this._bgtx = this.game.add.renderTexture(this.game.width, this.game.height);
        // this._bgspr = this.game.add.sprite(0, 0, this._bgtx);
        // this._bgspr.fixedToCamera = true;
        // this._bgspr.name = '_bgSprite';
        // this._bgspr.visible = false;

        // These <any> casts are because typescript doesn't have a method for extending existing classes
        // defined in external .d.ts files. This means phaser-tiled can't properly extend the type defs
        // for the classes it added methods to. I promise these exist :)
        // More info:
        // https://github.com/Microsoft/TypeScript/issues/9
        // https://github.com/Microsoft/TypeScript/issues/819
        this.tiledmap = (<any>this.add).tiledmap(this.levelKey);

        (<any>this.physics.p2).convertTiledCollisionObjects(this.tiledmap, 'collisions');
        (<any>this.physics.p2).convertTiledCollisionObjects(this.tiledmap, 'exits');
        (<any>this.physics.p2).convertTiledCollisionObjects(this.tiledmap, 'zones');

        if (Constants.DEBUG) {
            // this._enableDebugBodies(this.tiledmap.getObjectlayer('collisions'));
            this._enableDebugBodies(this.tiledmap.getObjectlayer('exits'));
            // this._enableDebugBodies(this.tiledmap.getObjectlayer('zones'));
        }

        // setup the player for a new level
        const exit = this.game.loadedSave.lastUsedExit;
        this.game.player.reset(exit.properties.loc[0], exit.properties.loc[1]);
        this.game.player.setup(this);

        this.game.player.onReadSign.add((sign: Entity) => {
            this.showDialog(sign.properties.text);
        }, this);

        this.game.player.onInventoryChange.add(() => {
            this.hud.updateValues(this.game.player);
        }, this);

        this.hud.updateValues(this.game.player);

        this.tiledmap.getObjectlayer('player').add(this.game.player);

        // ensure gravity is off
        this.game.physics.p2.world.gravity[0] = 0;
        this.game.physics.p2.world.gravity[1] = 0;

        // setup camera to follow the player
        this.game.camera.follow(this.game.player, Phaser.Camera.FOLLOW_LOCKON);

        // setup handlers for player sensor collisions
        this.game.physics.p2.onBeginContact.add(this.onBeginContact, this);
        this.game.physics.p2.onEndContact.add(this.onEndContact, this);

        this._firstZone = true;

        // this.lastExit = exit;

        // set link position
        // this.game.player.position.set(
        //     exit.properties.loc[0],
        //     exit.properties.loc[1]
        // );

        this.world.bringToTop(this.overlay);
        this.world.bringToTop(this.dialog);
        this.world.bringToTop(this.hud);
    }

    shutdown() {
        super.shutdown();

        // lose reference to player in camera
        this.game.camera.unfollow();

        // transitioning to a new state will destroy the world, including the player so remove it.
        this.game.player.parent.removeChild(this.game.player);

        this.game.player.onReadSign.removeAll(this);
        this.game.player.onInventoryChange.removeAll(this);

        // remove the listeners or they will keep firing
        this.game.physics.p2.onBeginContact.removeAll(this);
        this.game.physics.p2.onEndContact.removeAll(this);

        this.activeZone = null;
        this.oldZone = null;

        this.oldLayer = null;
        this.oldLayerOverlay = null;

        this.activeLayer = null;
        this.activeLayerOverlay = null;

        this.overlay.destroy(true);
        this.overlay = null;

        this.dialog.destroy(true);
        this.dialog = null;
    }

    showDialog(text: (string|string[])) {
        this.pause();

        this.dialog.show(text);
    }

    pause() {
        // // render the current world onto a texture
        // this.hud.visible = false;
        // this._bgtx.render(this.world);
        // this._bgspr.visible = true;

        // // turn the camera back on
        // this.hud.visible = true;

        // // hides and stop updates to the world
        // this.world.visible = false;

        this._paused = true;

        // stop physics updates
        this.physics.p2.pause();
    }

    resume() {
        // this._bgspr.visible = false;
        // this.world.visible = true;

        this._paused = false;

        // restart physics simulation
        this.physics.p2.resume();
    }

    onBeginContact(bodyA: p2.IBodyEx, bodyB: p2.IBodyEx, shapeA: p2.Shape, shapeB: p2.Shape, contactEquations: any) {
        this._checkContact(true, bodyA, bodyB, shapeA, shapeB, contactEquations);
    }

    onEndContact(bodyA: p2.IBodyEx, bodyB: p2.IBodyEx, shapeA: p2.Shape, shapeB: p2.Shape, contactEquations: any) {
        this._checkContact(false, bodyA, bodyB, shapeA, shapeB, contactEquations);
    }

    /**
     * Input Handling
     */
    onKeyboardDown(event: KeyboardEvent) {
        super.onKeyboardDown(event);

        this.handleKeyboard(event.keyCode, true);
    }

    onKeyboardUp(event: KeyboardEvent) {
        super.onKeyboardUp(event);

        this.handleKeyboard(event.keyCode, false);
    }

    onGamepadDown(button: number, value: number) {
        super.onGamepadDown(button, value);

        this.handleGamepadButton(button, value, true);
    }

    onGamepadUp(button: number, value: number) {
        super.onGamepadUp(button, value);

        this.handleGamepadButton(button, value, false);
    }

    onGamepadAxis(pad: Phaser.SinglePad, index: number, value: number) {
        super.onGamepadAxis(pad, index, value);

        this.handleGamepadAxis(index, value, true);
    }

    handleGamepadAxis(index: number, value: number, active: boolean) {
        // TODO: stick handling
        // switch(index) {
        //     // AXIS UP/DOWN
        //     case Phaser.Gamepad.XBOX360_STICK_LEFT_Y:
        //         this.game.player.lookUp(value > 0 ? active : false);
        //         this.game.player.duck(value < 0 ? active : false);
        //         GarageServerIO.addInput({ name: 'lookUp', active: value > 0 ? active : false, value: value });
        //         GarageServerIO.addInput({ name: 'duck', active: value < 0 ? active : false, value: value });
        //         break;

        //     // AXIS LEFT/RIGHT
        //     case Phaser.Gamepad.XBOX360_STICK_LEFT_X:
        //         this.game.player.move(Phaser.RIGHT, value, value > 0 ? active : false);
        //         this.game.player.move(Phaser.LEFT, -value, value < 0 ? active : false);
        //         GarageServerIO.addInput({ name: 'forward', active: value > 0 ? active : false, value: value });
        //         GarageServerIO.addInput({ name: 'backward', active: value < 0 ? active : false, value: -value });
        //         break;
        // }
    }

    handleKeyboard(key: number, active: boolean) {
        if (key === this.keymap.keyboard.use && this.dialog.visible) {
            if (this.dialog.typing || this.dialog.queue.length) {
                this.dialog.advance();
            }
            else {
                this.dialog.hide();
                this.resume();
            }
            return;
        }

        if (this._paused) {
            return;
        }

        switch (key) {
            // use
            case this.keymap.keyboard.use:
                this.game.player.use(active);
                break;

            // use item
            case this.keymap.keyboard.useItem:
                this.game.player.useItem(active);
                break;

            // attack
            case this.keymap.keyboard.attack:
                this.game.player.attack(active);
                break;

            // UP
            case this.keymap.keyboard.up:
                this.game.player.move(Phaser.UP, 1, active);
                break;

            // DOWN
            case this.keymap.keyboard.down:
                this.game.player.move(Phaser.DOWN, 1, active);
                break;

            // LEFT
            case this.keymap.keyboard.left:
                this.game.player.move(Phaser.LEFT, 1, active);
                break;

            // RIGHT
            case this.keymap.keyboard.right:
                this.game.player.move(Phaser.RIGHT, 1, active);
                break;
        }
    }

    handleGamepadButton(button: number, value: number, active: boolean) {
        switch (button) {
            // UP
            case this.keymap.gamepad.up:
                this.game.player.move(Phaser.UP, value, active);
                break;

            // DOWN
            case this.keymap.gamepad.down:
                this.game.player.move(Phaser.DOWN, value, active);
                break;

            // LEFT
            case this.keymap.gamepad.left:
                this.game.player.move(Phaser.LEFT, value, active);
                break;

            // RIGHT
            case this.keymap.gamepad.right:
                this.game.player.move(Phaser.RIGHT, value, active);
                break;
        }
    }

    private _enableDebugBodies(layer: Phaser.Plugin.Tiled.Objectlayer) {
        if (!layer) {
            return;
        }

        for (let i = 0; i < layer.bodies.length; ++i) {
            let body: Phaser.Physics.P2.Body = layer.bodies[i];

            body.debug = true;
        }
    }

    private _checkContact(begin: boolean, bodyA: p2.IBodyEx, bodyB: p2.IBodyEx, shapeA: p2.Shape, shapeB: p2.Shape, contactEquations: any) {
        if (!bodyA.parent || !bodyB.parent) {
            return;
        }

        if (bodyA.parent.sprite !== this.game.player && bodyB.parent.sprite !== this.game.player) {
            return;
        }

        const playerIsA = bodyA.parent.sprite === this.game.player;
        // const playerBody = playerIsA ? bodyA.parent : bodyB.parent;
        const playerShape = playerIsA ? shapeA : shapeB;
        const objBody = playerIsA ? bodyB.parent : bodyA.parent;
        const objShape = playerIsA ? shapeB : shapeA;
        const obj = objBody.sprite || (<any>objBody).tiledObject; // the tiledObject property is added by phaser-tiled

        if (!obj) {
            return;
        }

        if (begin && contactEquations.length && playerShape === this.game.player.bodyShape) {
            this._tempVector.set(-contactEquations[0].normalA[0], -contactEquations[0].normalA[1]);

            // colliding with a new zone
            if (obj.type === 'zone') {
                return this._zone(obj, this._tempVector);
            }
            // collide with an exit
            else if (obj.type === 'exit') {
                return this._exit(obj, this._tempVector);
            }
        }

        if (begin) {
            this.game.player.onBeginContact(obj, objShape, playerShape);
        }
        else {
            this.game.player.onEndContact(obj, objShape, playerShape);
        }
    }

    private _exit(exit: Phaser.Plugin.Tiled.ITiledObject, vec: TPoint) {
        if (!exit.properties.animation) {
            this._mapTransition(exit, vec);
        }
        else {
            this.game.player.events.onAnimationComplete.addOnce(function() {
                this._doMapTransition(exit, vec);
                this.game.player.unlock();
            }, this);

            this.game.player.lock();
            this.game.player.animations.play(exit.properties.animation);

            return;
        }
    }

    private _mapTransition(exit: Phaser.Plugin.Tiled.ITiledObject, vec: TPoint) {
        switch (exit.properties.transition) {
            case 'none':
                this._gotoLevel(exit, vec);
                break;

            case 'close':
                // make this work again...
                // this.camera.close('ellipse', animTime, this.link.position, function() {
                //     self._dogotoMap(exit, vec);
                // });
                /* falls through, for now */

            case 'fade':
                /* falls through */
            default:
                this.game.effects.fadeScreen(Constants.COLORS.BLACK, Constants.EFFECT_MAP_TRANSITION_TIME)
                    .onComplete.addOnce(function () {
                        this._gotoLevel(exit, vec);
                    }, this);
                break;
        }
    }

    private _gotoLevel(exit: Phaser.Plugin.Tiled.ITiledObject, vec: TPoint) {
        this.game.save(exit);

        this.game.state.start('level_' + exit.name);
    }

    private _zone(zone: Phaser.Plugin.Tiled.ITiledObject, vec: TPoint) {
        // done repeat zoning
        if (zone === this.activeZone) {
            return;
        }

        // save old actives
        this.oldZone = this.activeZone;
        this.oldLayer = this.activeLayer;
        this.oldLayerOverlay = this.activeLayerOverlay;

        // assign new actives
        this.activeZone = zone;
        this.activeLayer = this.tiledmap.getObjectlayer(zone.name);
        this.activeLayerOverlay = this.tiledmap.getObjectlayer(zone.name + '_overlay');

        // spawn layer objects
        this.activeLayer.spawn(Phaser.Physics.P2JS);

        this._setupOverlay();

        this._setupZone(vec);
    }

    private _setupOverlay() {
        this.overlay.deactivate();

        if (this.oldLayerOverlay) {
            this.oldLayerOverlay.despawn();
        }

        // show overlay for layer or map
        if (this.activeLayerOverlay) {
            this.activeLayerOverlay.spawn(Phaser.Physics.P2JS);
        }
        else if (this.tiledmap.properties.overlay) {
            this.overlay.activate(this.tiledmap.properties.overlay);
        }
    }

    private _setupZone(vec: TPoint) {
        // const mapData = this.game.loadedSave.mapData[this.tiledmap.name];
        // const zoneData = mapData ? mapData[this.activeLayer.name] : null;

        this.camera.unfollow();
        this.camera.bounds = null;

        if (!this._firstZone) {
            this._zoneTransition(vec);
        }
        else {
            this._zoneReady();
        }
    }

    private _zoneTransition(vec: TPoint) {
        const vel = vec.x ? vec.x : vec.y;
        const cameraEnd: TTable<number> = {};

        this.game.player.lock();

        switch (this.activeZone.properties.transition) {
            case 'fade':
                this.game.effects.fadeScreen(Constants.COLORS.BLACK, Constants.EFFECT_ZONE_TRANSITION_TIME)
                    .onComplete.addOnce(function () {
                        // pan camera
                        this.camera.x += this.camera.width * vec.x;
                        this.camera.y += this.camera.height * vec.y;

                        this._transitionPlayer(!!vec.x, vel);

                        // zone ready
                        this._zoneReady();
                    }, this);
                break;

            case 'none':
                // pan camera
                this.camera.x += this.camera.width * vec.x;
                this.camera.y += this.camera.height * vec.y;

                this._transitionPlayer(!!vec.x, vel);

                // zone ready
                this._zoneReady();
                break;

            case 'slide':
                /* falls through */
            default:
                if (vec.x) {
                    cameraEnd['x'] = this.camera.x + this.camera.width * vel;
                }
                else {
                    cameraEnd['y'] = this.camera.y + this.camera.height * vel;
                }

                this.game.add.tween(this.camera)
                    .to(cameraEnd, Constants.EFFECT_ZONE_TRANSITION_TIME)
                    .start()
                    .onComplete.addOnce(this._zoneReady, this);

                this._transitionPlayer(!!vec.x, vel, true);
                break;
        }
    }

    private _transitionPlayer(horizontal: boolean, vector: number, ease: boolean = true) {
        if (ease) {
            const playerEnd: TTable<number> = {
                x: this.game.player.body.x,
                y: this.game.player.body.y,
            };

            playerEnd[horizontal ? 'x' : 'y'] += Constants.EFFECT_ZONE_TRANSITION_SPACE * vector;

            this.game.add.tween(this.game.player.body)
                .to(playerEnd, Constants.EFFECT_ZONE_TRANSITION_TIME)
                .start();
        }
        else {
            if (horizontal) {
                this.game.player.body.x += Constants.EFFECT_ZONE_TRANSITION_SPACE * vector;
            }
            else {
                this.game.player.body.y += Constants.EFFECT_ZONE_TRANSITION_SPACE * vector;
            }
        }
    }

    private _zoneReady() {
        if (this.oldLayer) {
            this.game.save(null, this.oldLayer);

            this.oldLayer.despawn();
        }

        const zone = this.activeZone;

        this._firstZone = false;

        this._cameraBounds.copyFrom(zone);
        this.camera.bounds = this._cameraBounds;

        this.camera.follow(this.game.player, Phaser.Camera.FOLLOW_LOCKON);

        // play zone music, or the map music if there is no zone music
        this._setupMusic(zone.properties.music || this.tiledmap.properties.music);

        this.game.player.unlock();
    }

    private _setupMusic(key?: string) {
        // no key or already playing
        if (!key || (this.music && this.music.key === key)) {
            return;
        }

        // destroy current music object
        if (this.music) {
            this.music.destroy();
        }

        this.music = this.add.audio(key, Constants.AUDIO_MUSIC_VOLUME, true);

        this.music.play();
    }
}
