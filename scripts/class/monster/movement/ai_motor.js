import { Entity, Instance } from "cs_script/point_script";
import { AIMoveProbe } from "./ai_moveprobe";
import { AIStuckMonitor } from "./ai_stuck";
import { friction, gravity, stepHeight } from "../monster_const";
import { vec } from "../../util/vector";

export class AIMotor {
    /**
     * @param {Entity} entity
     */
    constructor(entity) {
        this.entity = entity;
        this.moveProbe = new AIMoveProbe(entity);
        this.stuck = new AIStuckMonitor(entity);
        // 运动状态
        this.velocity = vec.get(0, 0, 0);
        this.onGround = false;

        this.ground = {
            hit: false,
            normal: vec.get(0, 0, 0),
            point: vec.get(0, 0, 0)
        };
        this.wasOnGround = false;
    }
    /**
     * @param {import("cs_script/point_script").Vector} wishDir 目标方向 (单位向量)
     * @param {number} dt 帧间隔
     */
    _updateRotation(wishDir, dt) {

        const currentYaw = this.entity.GetAbsAngles().yaw;
        const targetYaw = Math.atan2(wishDir.y, wishDir.x) * 180 / Math.PI;
        // 1. 计算角度差
        let delta = targetYaw - currentYaw;
        // 2. 角度标准化 (Normalize) - 核心逻辑
        // 这一步确保 NPC 总是走“最短路径”转向
        // 例如：从 350° 转到 10°，应该转 +20°，而不是转 -340°
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        // 3. 限制每帧最大转速
        const TURN_SPEED = 360; // 定义旋转速度：每秒转多少度 (根据需求调整，比如 180 或 720)
        const maxStep = TURN_SPEED * dt;
        // 4. 钳制 (Clamp) 实际转动量
        // 如果这一帧能转到位，就直接转到位；否则只转 maxStep 那么多
        if (delta > maxStep) delta = maxStep;
        else if (delta < -maxStep) delta = -maxStep;

        return currentYaw + delta;
    }

    /**
     * 计算 NPC-NPC 分离速度
     * @returns {import("cs_script/point_script").Vector}
     * @param {Entity[]} mpos
     */
    _computeSeparationVelocity(mpos) {
        const pos = this.getposV3();

        // ===== 可调参数（非常重要）=====
        const radius = 16;          // 搜索半径
        const maxStrength = 150;    // 最大分离速度
        const minRadius = 8;       // 最小半径

        let separation = vec.get(0, 0, 0);

        for (const other of mpos) {
            const otherPos = vec.clone(other.GetAbsOrigin());
            let delta = vec.sub(pos,otherPos);

            const dist = vec.length2D(delta);
            if (dist < 0.1 || vec.length(delta) > radius) continue;
            delta.z = 0;
            const dir = vec.scale(delta,1 / dist);
            let strength = 1.0;

            if (dist > minRadius) strength = (radius - dist) / (radius - minRadius);

            separation = vec.add(separation,vec.scale(dir,strength * maxStrength));
        }

        const len = vec.length2D(separation);
        if (len > maxStrength) {
            separation = vec.scale(separation,maxStrength / len);
        }
        return separation;
    }
    /**
     * @param {import("cs_script/point_script").Vector} wishDir
     * @param {number} wishSpeed
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    moveGround(wishDir, wishSpeed, dt, mpos) {
        // 1️⃣ 摩擦（Source: 先摩擦再加速）
        this._applyFriction(dt);

        // 2️⃣ 加速到期望速度（不是直接 set）
        this._accelerate2D(wishDir, wishSpeed, dt);

        // 3️⃣ NPC-NPC 分离（Source 风格）
        const sepVel = this._computeSeparationVelocity(mpos);
        this.velocity = vec.add(this.velocity,sepVel);

        // 3️⃣ 计算期望位移（只在 X/Y）
        const move = vec.scale(this.velocity,dt);
        move.z = 0;

        // 4️⃣ Step + Slide（Source 顺序）
        let pos = this._stepSlideMove(move, mpos).pos;

        // 6️⃣ 贴地（非常关键）
        this._updateGround(pos, mpos);

        pos = this._snapToGround(pos);

        const yaw = this._updateRotation(wishDir, dt);
        this.entity.Teleport({ position: pos, angles: { pitch: 0, yaw, roll: 0 } });

        this.stuck.update(pos, dt);
        return pos;
    }
    /**
     * @param {number} dt
     */
    _applyFriction(dt) {
        const speed = vec.length2D(this.velocity);
        if (speed < 0.1) return;

        const drop = speed * friction * dt;
        const newSpeed = Math.max(0, speed - drop);

        this.velocity = vec.scale2D(this.velocity,newSpeed / speed);
    }

    /**
     * @param {import("cs_script/point_script").Vector} wishDir
     * @param {number} wishSpeed
     * @param {number} dt
     */
    _accelerate2D(wishDir, wishSpeed, dt) {
        if (wishSpeed <= 0) return;
        const currentSpeed = vec.dot2D(this.velocity,wishDir);
        const addSpeed = wishSpeed - currentSpeed;
        if (addSpeed <= 0) return;

        const accelSpeed = Math.min(addSpeed, wishSpeed * dt * 10);
        this.velocity = vec.add2D(this.velocity,vec.scale(wishDir,accelSpeed));
    }
    /**
     * @param {import("cs_script/point_script").Vector} move
     * @param {Entity[]} allm
     */
    _stepSlideMove(move, allm) {
        let start = this.getposV3();
        const end = vec.add(start,move);

        // 1️⃣ 先尝试直接移动
        const direct = this.moveProbe.traceMove(start, end, allm);
        if (!direct.hit) return { pos: direct.endPos };

        // 2️⃣ 尝试 step（上 → 前 → 下）
        const step = this.moveProbe.tryStep(start, move, stepHeight, allm);
        if (step.success) return { pos: step.endPos };

        // 3️⃣ 否则 slide
        const MAX_CLIPS = 3;
        let remaining = vec.clone(move);
        const clipNormals = [];
        for (let i = 0; i < MAX_CLIPS; i++) {
            if (vec.length2D(remaining) < 0.01) break;
            const endPos = vec.add(start,remaining);
            const tr = this.moveProbe.traceMove(start, endPos, allm);

            // 没撞，直接成功
            if (!tr.hit) return { pos: tr.endPos };

            // 推进到碰撞点
            const traveled = vec.scale(remaining,tr.fraction);
            start = vec.add(start,traveled);

            // 记录这个平面
            clipNormals.push(vec.clone(tr.normal));

            // 剩余位移 = 剩下的那一段
            remaining = vec.scale(remaining,1 - tr.fraction);

            // 从 remaining 中移除所有约束平面的非法分量
            remaining = this._clipMoveByNormals(remaining, clipNormals);
        }
        return { pos: start };
    }
    /**
     * @param {import("cs_script/point_script").Vector} move
     * @param {import("cs_script/point_script").Vector[]} normals
     */
    _clipMoveByNormals(move, normals) {
        let out = vec.clone(move);

        for (const n of normals) {
            const dot = vec.dot2D(out,n);
            if (dot < 0) {
                // 移除指向法线的分量
                out = vec.sub(out,vec.scale(n,dot));
            }
        }

        return out;
    }
    /**
     * @param {import("cs_script/point_script").Vector} wishDir
     * @param {number} wishSpeed
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    moveAir(wishDir, wishSpeed,dt, mpos) {
        // 空中只受重力 + 当前水平速度
        const deltav = gravity * dt;
        const vel=vec.scale(vec.normalize2D(wishDir),wishSpeed);
        // 2. 空中方向控制（弱）
        if (vec.length2D(wishDir) > 0.01) {
            const wishDir2D = vec.normalize2D(wishDir);

            // 空中最大可控速度（非常小）
            const airAccel = 10;         // 空中加速度

            // 当前速度在 wishDir 方向上的投影
            const currentSpeed =
                this.velocity.x * wishDir2D.x +
                this.velocity.y * wishDir2D.y;

            // 还能加多少
            const addSpeed = wishSpeed - currentSpeed;
            if (addSpeed > 0) {
                const accelSpeed = Math.min(airAccel * dt * wishSpeed, addSpeed);

                this.velocity.x += accelSpeed * wishDir2D.x;
                this.velocity.y += accelSpeed * wishDir2D.y;
            }
        }
        this.velocity.z = Math.max(-gravity, this.velocity.z - deltav);
        const posV3 = this.getposV3();
        //Instance.DebugLine({ start: posV3, end:(posV3.add(this.velocity.normalize().scale(5))), duration: 1 / 64 ,color:{r:0,g:255,b:0}});
        // 3️⃣ NPC-NPC 分离（Source 风格）
        const dir = vec.normalize2D(this.velocity);
        const sepVel = this._computeSeparationVelocity(mpos);
        this.velocity = vec.add(this.velocity,sepVel);
        const move = vec.scale(this.velocity,dt);
        const result = this._airSlideMove(posV3, move, mpos);
        let pos = result.pos;
        // 5. 根据 slide 的平面修正 velocity
        if (result.clipNormals?.length) {
            for (const n of result.clipNormals) {
                this.velocity = this._clipVelocity(this.velocity, n);
            }
        }
        this._updateGround(pos, mpos);

        const yaw = this._updateRotation(dir, dt);
        this.entity.Teleport({ position: pos, angles: { pitch: 0, yaw, roll: 0 } });

        this.stuck.update(pos, dt);
        return pos;
    }
    /**
     * 空中 Slide（Source TryPlayerMove 风格）
     * @param {import("cs_script/point_script").Vector} start
     * @param {import("cs_script/point_script").Vector} move 本帧希望移动的位移（velocity * dt）
     * @param {Entity[]} allm
     */
    _airSlideMove(start, move, allm) {
        const MAX_CLIPS = 3;
        let remaining = vec.clone(move);
        const clipNormals = [];

        for (let i = 0; i < MAX_CLIPS; i++) {

            // ✅ 空中用 3D 长度
            if (vec.length(remaining) < 0.01) break;

            const endPos = vec.add(start,remaining);
            const tr = this.moveProbe.traceMove(start, endPos, allm);

            // 没撞，直接完成
            if (!tr.hit) return { pos: tr.endPos, clipNormals };
            // 推进到撞击点
            const traveled = vec.scale(remaining,tr.fraction);
            start = vec.add(start,traveled);

            // 记录平面
            clipNormals.push(vec.clone(tr.normal));

            // 剩余位移
            remaining = vec.scale(remaining,1 - tr.fraction);

            // 用所有约束平面裁剪 remaining
            remaining = this._clipMoveByNormals(remaining, clipNormals);
        }

        return { pos: start, clipNormals };
    }
    /**
     * Source 风格 ClipVelocity
     * @param {import("cs_script/point_script").Vector} vel   当前速度
     * @param {import("cs_script/point_script").Vector} normal  碰撞平面法线（必须是单位向量）
     * @param {number} overbounce  通常 1.0 ~ 1.01
     */
    _clipVelocity(vel, normal, overbounce = 1.01) {
        const backoff = vec.dot(vel,normal);

        // 如果速度本来就在远离平面，不需要裁剪
        if (backoff >= 0) {
            return vec.clone(vel);
        }

        // v' = v - n * backoff * overbounce
        const change = vec.scale(normal,backoff * overbounce);
        const out = vec.sub(vel,change);

        // 防止非常小的数导致抖动
        if (Math.abs(out.x) < 0.0001) out.x = 0;
        if (Math.abs(out.y) < 0.0001) out.y = 0;
        if (Math.abs(out.z) < 0.0001) out.z = 0;

        return out;
    }
    /**
     * @param {import("cs_script/point_script").Vector} pos
     */
    _snapToGround(pos) {
        // ❌ 上一帧不在地面 → 不 snap
        if (!this.wasOnGround) return pos;

        // ❌ 当前不在地面 → 不 snap
        if (!this.onGround) return pos;

        // ❌ 垂直速度明显不为 0 → 不 snap
        if (this.velocity.z < -1) return pos;

        // ❌ 没有有效地面信息
        if (!this.ground.hit) return pos;

        // 只修正很小的高度误差

        const dz = this.ground.point.z - pos.z;
        if (Math.abs(dz) > 4) return pos;

        pos.z = this.ground.point.z;
        return pos;
    }
    /**
     * @param {import("cs_script/point_script").Vector} wishDir
     * @param {number} wishSpeed
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    moveFly(wishDir,wishSpeed,dt,mpos)
    {
        const start = this.getposV3();

        // 1️⃣ 3D 加速（Fly = 空中加速 + Z）
        this._accelerate3D(wishDir, wishSpeed, dt);

        // 2️⃣ NPC-NPC 分离（可选，但你地面 / 空中都用了，这里保持一致）
        const sepVel = this._computeSeparationVelocity(mpos);
        this.velocity = vec.add(this.velocity,sepVel);

        // 3️⃣ 本帧位移
        const move = vec.scale(this.velocity,dt);

        // 4️⃣ 3D SlideMove（TryPlayerMove）
        const result = this._airSlideMove(start, move, mpos);
        let pos = result.pos;

        // 5️⃣ Clip velocity（防止贴墙抖动）
        if (result.clipNormals && result.clipNormals.length > 0) {
            for (const n of result.clipNormals) {
                this.velocity = this._clipVelocity(this.velocity, n);
            }
        }

        // 6️⃣ 飞行不贴地,或者可以飞行落地变行走
        this.onGround = false;

        // 7️⃣ 朝向：完全跟随速度方向
        const yaw =this._updateRotation(vec.normalize2D(this.velocity), dt);

        this.entity.Teleport({position: pos,angles: { pitch: 0, yaw, roll: 0 }});

        this.stuck.update(pos, dt);
        return pos;
    }
    /**
     * 3D 加速（Fly / NoClip）
     * @param {import("cs_script/point_script").Vector} wishDir
     * @param {number} wishSpeed
     * @param {number} dt
     */
    _accelerate3D(wishDir, wishSpeed, dt) {
        if (wishSpeed <= 0) return;

        const currentSpeed = vec.dot(this.velocity,wishDir);
        const addSpeed = wishSpeed - currentSpeed;
        if (addSpeed <= 0) return;

        const accel = wishSpeed * dt * 10; // 系数可调
        const accelSpeed = Math.min(addSpeed, accel);

        this.velocity = vec.add(this.velocity,vec.scale(wishDir,accelSpeed));
    }
    /**
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    movePounce(dt,mpos)
    {
        const start = this.getposV3();
        this.velocity.z -= gravity * dt;
        // 1️⃣ 本帧位移
        const move = vec.scale(this.velocity,dt);

        // 2️⃣ 使用空中 SlideMove（和 AirMove 同源）
        const result = this._airSlideMove(start, move, mpos);
        let pos = result.pos;

        // 3️⃣ 根据碰撞平面修正 velocity（非常关键）
        if (result.clipNormals && result.clipNormals.length > 0) {
            for (const n of result.clipNormals) {
                this.velocity = this._clipVelocity(this.velocity, n);
            }
        }

        // 4️⃣ 更新地面状态（只用于检测是否落地）
        this._updateGround(pos, mpos);

        // 5️⃣ 朝向：根据水平速度
        const yaw =this._updateRotation(vec.normalize2D(this.velocity), dt);

        // 6️⃣ 推进实体
        this.entity.Teleport({position: pos,angles: { pitch: 0, yaw, roll: 0 }});

        this.stuck.update(pos, dt);

        return pos;
    }
    /**
     * Source 风格 CategorizePosition
     * 同时决定：
     * - 是否在地面
     * - 地面法线
     * - snap 点
     * @param {import("cs_script/point_script").Vector} pos
     * @param {Entity[]} allm
     */
    _updateGround(pos, allm) {
        const tr = this.moveProbe.traceGround(pos, allm);

        this.wasOnGround = this.onGround;

        this.ground.hit = false;

        if (!tr.hit || !tr.hitPos) {
            this.onGround = false;
            return;
        }

        // 不可站立的坡
        if (tr.normal.z < 0.5) {
            this.onGround = false;
            return;
        }

        // ✅ 可站立
        this.onGround = true;
        this.ground.hit = true;
        this.ground.normal = vec.clone(tr.normal);
        this.ground.point = vec.clone(tr.hitPos);
    }
    stop() {
        this.velocity=vec.get(0, 0, 0);
    }

    isOnGround() {
        return this.onGround;
    }

    getVelocity() {
        return vec.clone(this.velocity);
    }

    getposV3() {
        return vec.clone(this.entity.GetAbsOrigin());
    }
}
