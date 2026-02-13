import { goalTolerance } from "../../game_const";
import { vec } from "../../util/vector";
import { PathState } from "./npc_locomotion";

export class PathFollower {
    constructor() {
        /**
         * @type {{ pos: import("cs_script/point_script").Vector; mode: number; }[]}
         */
        this.path = [];             // NavPath
        this.cursor = 0;            // 当前 area index
    }

    /**
     * @param {{ pos: import("cs_script/point_script").Vector; mode: number; }[]} path
     */
    setPath(path) {
        this.path = path.map(function (i) {
            return { pos: vec.clone(i.pos), mode: i.mode };
        });
        this.cursor = 0;
    }

    isFinished() {
        return this.path.length == 0 || this.cursor >= this.path.length;
    }

    clear() {
        this.path = [];
        this.cursor = 0;
    }
    getMoveGoal() {
        if (this.isFinished()) {
            return null;
        }
        const area = this.path[this.cursor];
        return area;
    }
    /**
     * 如果足够接近当前目标，则推进 cursor
     * @param {import("cs_script/point_script").Vector} currentPos
     */
    advanceIfReached(currentPos, tolerance = goalTolerance) {
        while (true) {
            if (this.isFinished()) return;

            const goal = this.getMoveGoal();
            if (!goal) return;

            const dist = vec.length2D(vec.sub(currentPos, goal.pos));
            if(goal.mode==PathState.JUMP)
            {
                if (dist <= 2){//跳跃检查更严格，让其停稳
                    this.cursor++;
                    continue;
                }
            }
            else if (dist <= tolerance) {
                this.cursor++;
                continue;
            }
            break;
        }
    }
}
