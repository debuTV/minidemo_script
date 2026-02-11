import { vec } from "../../util/vector";

export class PathFollower {
    constructor() {
        /**
         * @type {{ pos: import("cs_script/point_script").Vector; mode: number; }[]}
         */
        this.path = [];             // NavPath
        this.cursor = 0;            // 当前 area index
        this.goalTolerance = 16;    // 认为“到达”的距离
    }

    /**
     * @param {{ pos: import("cs_script/point_script").Vector; mode: number; }[]} path
     */
    setPath(path) {
        this.path = path;
        this.cursor = 0;
    }

    isFinished() {
        return this.path.length==0 || this.cursor >= this.path.length;
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
    advanceIfReached(currentPos, tolerance = this.goalTolerance) {
        if (this.isFinished()) return;

        const goal = this.getMoveGoal();
        if (!goal) return;

        const dist = vec.length2D(vec.sub(currentPos,goal.pos));
        if (dist <= tolerance) {
            this.cursor++;
        }
    }
}
