import { Entity } from "cs_script/point_script";
import { vec } from "../../util/vector";
import { moveEpsilon, timeThreshold } from "../../game_const";

export class AIStuckMonitor {
    /**
     * @param {Entity} entity
     */
    constructor(entity) {
        this.entity = entity;

        this.lastPos = vec.get(0,0,0);
        this.stuckTime = 0;

        // 参数（Source 风格）
        this.moveEpsilon = moveEpsilon;     // 认为“没动”的距离
        this.timeThreshold = timeThreshold;     // 持续多久算卡死
    }
    /**
     * 每帧调用
     * @param {import("cs_script/point_script").Vector} pos
     * @param {number} dt
     */
    update(pos,dt) {
        const moved = vec.length(vec.sub(pos,this.lastPos));

        if (moved < this.moveEpsilon) {
            this.stuckTime += dt;
        } else {
            this.stuckTime = 0;
        }

        this.lastPos = vec.clone(pos);

        if(this.isStuck())this.resolve(pos);
    }

    isStuck() {
        return this.stuckTime >= this.timeThreshold;
    }

    /**
     * Source 风格解卡：轻微、随机、短距离
     * @param {import("cs_script/point_script").Vector} pos
     */
    resolve(pos) {
        if (!this.isStuck()) return;
        const newpos=vec.Zfly(pos,1);
        this.entity.Teleport({position:newpos});

        // 重置状态
        this.stuckTime = 0;
    }
}
