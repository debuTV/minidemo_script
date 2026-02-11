import { Entity } from "cs_script/point_script";
import { MoveWalk,MoveAir,MoveFly,MovePounce } from "./move_mode";
import { NPCLocomotion } from "./npc_locomotion";

export class MovementController {
    /**
     * @param {NPCLocomotion} loco
     */
    constructor(loco) {
        this.loco = loco;

        this.modes = {
            walk: new MoveWalk(),
            air: new MoveAir(),
            fly: new MoveFly()
        };

        this.current = null;
        this.currentName = "";
    }

    /**
     * @param {"walk"|"air"|"fly"|"pounce"} name
     * @param {any} [arg]
     */
    setMode(name, arg) {
        if (this.currentName === name) return;

        if (this.current) {
            this.current.leave(this.loco);
        }

        if (name === "pounce") {
            this.current = new MovePounce(arg);
        } else {
            this.current = this.modes[name];
        }

        this.currentName = name;
        this.current.enter(this.loco);
    }

    /**
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    update(dt, mpos) {
        if (this.current) {
            this.current.update(this.loco, dt, mpos);
        }
    }
}
