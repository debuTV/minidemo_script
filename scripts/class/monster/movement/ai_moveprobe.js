import { Entity, Instance } from "cs_script/point_script";
import { vec } from "../../util/vector";
import { groundCheckDist, surfaceEpsilon, Tracemaxs, Tracemins } from "../../game_const";

export class AIMoveProbe {
    /**
     * @param {Entity} entity
     */
    constructor(entity) {
        this.entity = entity;

        // 碰撞参数
        this.mins = Tracemins;//抬高一个高度
        this.maxs = Tracemaxs;
        this.groundCheckDist = groundCheckDist;
        this.surfaceEpsilon = surfaceEpsilon;
    }
    // 扫描前方是否被阻挡
    /**
     * @param {import("cs_script/point_script").Vector} start
     * @param {import("cs_script/point_script").Vector} end
     * @param {Entity[]}allm
     */
    traceMove(start, end, allm) {
        const tr = Instance.TraceBox({
            mins: this.mins,
            maxs: this.maxs,
            start,
            end,
            ignorePlayers: true,
            ignoreEntity: allm
        });
        if (!tr || !tr.didHit)
            return {
                hit: false,
                endPos: end,
                hitPos: vec.add(tr.end,vec.scale(tr.normal,this.surfaceEpsilon)),
                normal: tr.normal,
                fraction: tr.fraction
            };

        return {
            hit: true,
            endPos: end,
            hitPos: vec.add(tr.end,vec.scale(tr.normal,this.surfaceEpsilon)),
            normal: tr.normal,
            fraction: tr.fraction
        };

    }
    // 检测是否站在地面
    /**
     * @param {import("cs_script/point_script").Vector} pos
     * @param {Entity[]} allm
     */
    traceGround(pos, allm) {
        const start = vec.clone(pos);
        const end = vec.Zfly(pos,-this.groundCheckDist);
        const tr = Instance.TraceBox({
            mins: this.mins,
            maxs: this.maxs,
            start: start,
            end: end,
            ignorePlayers: true,
            ignoreEntity: allm
        });
        if (!tr || !tr.didHit || tr.normal.z < 0.5)
            return {
                hit: false,
                hitPos: vec.add(tr.end,vec.scale(tr.normal,this.surfaceEpsilon)),
                normal: tr.normal
            };
        return {
            hit: true,
            hitPos: vec.add(tr.end,vec.scale(tr.normal,this.surfaceEpsilon)),
            normal: tr.normal
        };
    }
    // 尝试 step（上 → 前 → 下）
    /**
     * @param {import("cs_script/point_script").Vector} start
     * @param {import("cs_script/point_script").Vector} move
     * @param {number} stepHeight
     * @param {Entity[]} allm
     */
    tryStep(start, move, stepHeight, allm) {
        // 向上
        const up = vec.Zfly(start,stepHeight);
        const trUp = this.traceMove(start, up, allm);
        if (trUp.hit) return { success: false, endPos: trUp.hitPos };

        // 向前
        const forwardEnd = vec.add(up,move);
        const trForward = this.traceMove(up, forwardEnd, allm);
        if (trForward.hit) return { success: false, endPos: trUp.hitPos };

        // 向下
        const downEnd = vec.Zfly(forwardEnd,-stepHeight);
        const trDown = this.traceMove(forwardEnd, downEnd, allm);
        if (!trDown.hit) return { success: false, endPos: trDown.hitPos };
        // 必须是地面
        if (trDown.normal.z < 0.5) return { success: false, endPos: trDown.hitPos };

        return {
            success: true,
            endPos: trDown.hitPos
        };
    }
}
