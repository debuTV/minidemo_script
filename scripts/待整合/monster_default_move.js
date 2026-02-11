import { Entity, Instance } from "cs_script/point_script";
import { MonsterManager } from "./monster_manager";

export class Monster_Default_Move {
    /**
     * 默认移动类，agent会每几秒更新路径，然后沿路径贴地面移动
     * @param {MonsterManager} mm 
     * @param {Entity} agent          //breakable实体
     * @param {number} maxVelocity    //最大速度
     * @param {number} acceleration   //加速度
     * @param {number} radius         //怪物防重叠半径
     * @param {number} stopradius     //到这个距离就停下来了
     */
    constructor(mm,agent,maxVelocity=100,acceleration=150,radius=30,stopradius=49) {
        /** @type {MonsterManager} */
        this.mm=mm;
        /** @type {Entity} */
        this.agent = agent;

        /**@type {import("cs_script/point_script").Vector} */
        this.nextpos;
        /**@type {import("cs_script/point_script").Vector[]} */
        this.path = [];
        /**@type {import("cs_script/point_script").Vector} */
        this.position=agent.GetAbsOrigin();
        /**@type {import("cs_script/point_script").QAngle} */
        this.Angles=agent.GetAbsAngles();
        /**@type {import("cs_script/point_script").Vector} */
        this.Velocity={x:0,y:0,z:0};

        this.maxVelocity=maxVelocity;
        this.acceleration=acceleration;
        this.radius=radius;
        this.stopradius=stopradius;
        this.lasttick=Instance.GetGameTime();
    }
    computeSeparation() {
        let push = { x: 0, y: 0, z: 0 };
        let count = 0;
        const allm = this.mm.getAllMonsters();
        const neighbors=[];
        for(let m of allm)
        {
            const np=m.model.breakable.GetAbsOrigin();
            if(this.posDistance3D(this.position, np)<this.radius*2.5)
            {
                neighbors.push(np);
            }
        }
        for (let n of neighbors) {
            let diff = this.vecSub(this.position, n);
            diff.z = 0;

            let dist = this.vecLength(diff);
            if (dist < 0.001) continue;

            let overlap = this.radius * 2 - dist;
            if (overlap > 0) {
                // 越近推得越多（非线性也行）
                let strength = overlap / (this.radius * 2);
                let dir = this.vecNormalize(diff);
                push = this.vecAdd(push, this.vecMul(dir, strength));
                count++;
            }
        }

        if (count > 0) {
            push = this.vecMul(push, this.maxVelocity);
        }

        return push;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    getground(x,y,z)
    {
        //待更新
        return this.nextpos.z;
    }
    /**
     * 终点endpos,当前状态
     * @param {import("cs_script/point_script").Vector} endpos
     * @param {number} stats
     */
    tick(endpos,stats) {
        this.position=this.agent.GetAbsOrigin();
        this.Angles=this.agent.GetAbsAngles();
        const nowtick=Instance.GetGameTime();
        let dt=Instance.GetGameTime()-this.lasttick;
        if (dt <= 0) return;
        //if (dt > 0.018) dt = 0.018;//万一卡了当一帧处理，免得怪物瞬移
        this.lasttick=nowtick;
        if(stats==1)
        {
            if (!this.path || this.path.length === 0 || this.posDistance3D(endpos, this.path[this.path.length - 1]) > 50) {
                // 假设外部已给 funnel 后路径
                // 这里只做终点检查
                this.path[this.path.length - 1] = endpos;
            }
            this.nextpos = this.path[this.path.length - 1];
            let toTarget = this.vecSub(this.nextpos, this.position);
            toTarget.z = 0;

            let dist = this.vecLength(toTarget);
            let desiredVel = { x: 0, y: 0, z: 0 };

            if (dist > this.stopradius) {
                let dir = this.vecNormalize(toTarget);

                // Arrival：接近终点减速
                let speed = this.maxVelocity;
                const slowRadius = this.stopradius+20;
                if (dist < slowRadius) {
                    speed *= (dist-this.stopradius) / slowRadius;
                }

                desiredVel = this.vecMul(dir, speed);
            }

            let sepVel = this.computeSeparation();

            // 权重（L4D 风格：轻）
            const sepWeight = 0.4;
            desiredVel = this.vecAdd(
                desiredVel,
                this.vecMul(sepVel, sepWeight)
            );
            // --- 加速度限制---
            let dv = this.vecSub(desiredVel, this.Velocity);
            let dvLen = this.vecLength(dv);

            let maxDv = this.acceleration * dt;
            if (dvLen > maxDv) {
                dv = this.vecMul(this.vecNormalize(dv), maxDv);
            }
            this.Velocity = this.vecAdd(this.Velocity, dv);

            // --- 5. 积分位移 ---
            let delta = this.vecMul(this.Velocity, dt);
            let newPos = this.vecAdd(this.position, delta);

            // --- 6. 贴地（高度约束）---
            newPos.z = this.getground(newPos.x, newPos.y,this.position.z)+4;

            // --- 7. 更新角度（yaw 插值）---
            let targetYaw = this.getTargetYaw(this.position, endpos);//方向向着玩家//newPos);
            let yawDelta = this.deltaYaw(targetYaw, this.Angles.yaw);

            const maxYawSpeed = 180; // 度 / 秒
            let maxYawStep = maxYawSpeed * dt;
            yawDelta = Math.max(-maxYawStep, Math.min(maxYawStep, yawDelta));

            let newAngles = {
                pitch: 0,
                yaw: this.Angles.yaw + yawDelta,
                roll: 0
            };

            // --- 8. 写回（这是“连续运动”的结果）---
            this.agent.Teleport({
                position: newPos,
                angles: newAngles,
                velocity:{x:0,y:0,z:0}
            });
        }
        else
        {
            //攻击中，不追踪，只转向，并且规避其他怪物

            let desiredVel = { x: 0, y: 0, z: 0 };
            let sepVel = this.computeSeparation();

            // 权重（L4D 风格：轻）
            const sepWeight = 0.4;
            desiredVel = this.vecMul(sepVel, sepWeight);
            let dv = this.vecSub(desiredVel, this.Velocity);
            let dvLen = this.vecLength(dv);

            let maxDv = this.acceleration * dt;
            if (dvLen > maxDv) {
                dv = this.vecMul(this.vecNormalize(dv), maxDv);
            }
            this.Velocity = this.vecAdd(this.Velocity, dv);
            let delta = this.vecMul(this.Velocity, dt);
            let newPos = this.vecAdd(this.position, delta);

            newPos.z = this.getground(newPos.x, newPos.y,this.position.z)+4;

            let targetYaw = this.getTargetYaw(this.position, endpos);//方向向着玩家
            let yawDelta = this.deltaYaw(targetYaw, this.Angles.yaw);

            const maxYawSpeed = 180; // 度 / 秒
            let maxYawStep = maxYawSpeed * dt;
            yawDelta = Math.max(-maxYawStep, Math.min(maxYawStep, yawDelta));

            let newAngles = {
                pitch: 0,
                yaw: this.Angles.yaw + yawDelta,
                roll: 0
            };

            // --- 8. 写回（这是“连续运动”的结果）---
            this.agent.Teleport({
                position: newPos,
                angles: newAngles,
                velocity:{x:0,y:0,z:0}
            });
        }
        return;
    }
    /**
     * @param {number} a
     * @param {number} b
     */
    deltaYaw(a, b) {
        let d = a - b;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
    }
    /**
     * @param {import("cs_script/point_script").Vector} from
     * @param {import("cs_script/point_script").Vector} to
     */
    getTargetYaw(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }
    /**
     * 计算空间两点之间的距离
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     * @returns {number}
     */
    posDistance3D(a, b) {
        const dx = a.x - b.x; const dy = a.y - b.y; const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    /**
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     */
    vecAdd(a, b) {
        return {
            x: a.x + b.x,
            y: a.y + b.y,
            z: a.z + b.z
        };
    }
    /**
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     */
    vecSub(a, b) {
        return {
            x: a.x - b.x,
            y: a.y - b.y,
            z: a.z - b.z
        };
    }
    /**
     * @param {import("cs_script/point_script").Vector} a
     * @param {number} s
     */
    vecMul(a, s) {
        return {
            x: a.x * s,
            y: a.y * s,
            z: a.z * s
        };
    }
    /**
     * @param {import("cs_script/point_script").Vector} v
     */
    vecLength(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    }
    /**
     * @param {import("cs_script/point_script").Vector} v
     */
    vecNormalize(v) {
        let len = this.vecLength(v);
        if (len < 0.0001) return { x: 0, y: 0, z: 0 };
        return this.vecMul(v, 1 / len);
    }
}