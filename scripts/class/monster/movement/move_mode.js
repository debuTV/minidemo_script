import { Entity, Instance } from "cs_script/point_script";
import { NPCLocomotion } from "./npc_locomotion";
import { vec } from "../../util/vector";
import { gravity } from "../../game_const";

export class MoveMode {
    /**
     * @param {NPCLocomotion} loco
     */
    enter(loco) {}

    /**
     * @param {NPCLocomotion} loco
     */
    leave(loco) {}

    /**
     * @param {NPCLocomotion} loco
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    update(loco, dt, mpos) {}
}
export class MoveWalk extends MoveMode {
    /**
     * @param {NPCLocomotion} loco
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    update(loco, dt, mpos) {
        // 计算寻路输入
        loco.pathFollower.advanceIfReached(loco.entity.GetAbsOrigin());
        const goal = loco.pathFollower.getMoveGoal();
        //这里可以切换跳跃
        loco._computeWish(goal);
        // 地面移动
        loco.motor.moveGround(loco.wishDir, loco.wishSpeed, dt, mpos);

        // 自动切换到空中
        if (!loco.motor.isOnGround()) {
            loco.controller.setMode("air");
        }
    }
}
//受重力影响，类似跳跃，从高处落下
export class MoveAir extends MoveMode {
    /**
     * @param {NPCLocomotion} loco
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    update(loco, dt, mpos) {
        // 计算寻路输入
        loco.pathFollower.advanceIfReached(loco.entity.GetAbsOrigin());
        const goal = loco.pathFollower.getMoveGoal();
        loco._computeWish(goal);
        // 空中仍可有少量方向控制（可调）
        loco.motor.moveAir(loco.wishDir, 30,dt, mpos);

        // 落地 → 回到 Walk
        if (loco.motor.isOnGround()) {
            loco.motor.velocity.z=0;
            loco.controller.setMode("walk");
        }
    }
}
//不受重力影响，类似太空中
export class MoveFly extends MoveMode {
    /**
     * @param {NPCLocomotion} loco
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    update(loco, dt, mpos) {
        const goal = loco.pathFollower.getMoveGoal();
        if (!goal) return;

        const pos = loco.getposV3();
        const dir = vec.normalize(vec.sub(goal.pos,pos));

        const newpos=loco.motor.moveFly(dir, loco.maxSpeed, dt, mpos);
        loco.pathFollower.advanceIfReached(newpos,200);//直线飞过去，可以将到达路径点设置大一点
    }
}
export class MovePounce extends MoveMode {
    /**
     * @param {import("cs_script/point_script").Vector} targetPos
     */
    constructor(targetPos) {
        super();
        this.targetPos = targetPos;
        this.time = 0;
        this.duration = 1;
        this.velocity = vec.get(0,0,0);
    }

    /**
     * @param {NPCLocomotion} loco
     */
    enter(loco) {
        const start = loco.getposV3();
        const T = this.duration;

        // 反解抛物线初速度（Source 标准）
        this.velocity.x = (this.targetPos.x - start.x) / T;
        this.velocity.y = (this.targetPos.y - start.y) / T;
        this.velocity.z =
            (this.targetPos.z - start.z + 0.5 * gravity * T * T) / T;

        loco.motor.velocity = vec.clone(this.velocity);
    }
    /**
     * @param {NPCLocomotion} loco
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    update(loco, dt, mpos) {
        this.time += dt;

        // 纯物理推进（不使用 wishDir），不受挤开影响
        loco.motor.movePounce(dt, mpos);

        // 命中 / 落地 / 超时 → 结束
        if (this.time >= this.duration || loco.motor.isOnGround()) {
            loco.motor.velocity=vec.get(0,0,0);
            loco.controller.setMode("walk");
            //这里结束
        }
    }
}