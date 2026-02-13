import { Instance, BaseModelEntity, PointTemplate, CSPlayerPawn } from 'cs_script/point_script';

//待更新
//1.怪物跳跃调参
//2.产卵技能
//3.玩家毒气debuff

const targetTeam=5;      //怪物选取目标范围 t:2,ct:3  t+ct:5
const gravity=800;       //世界重力
const friction=6;        //摩擦力参数
const stepHeight=13;     //怪物爬台阶高度
const goalTolerance=8;   //路径切换距离
const arriveDistance=1;  //距离最后一个导航点这个距离后，怪物不会再前进
const moveEpsilon=0.5;   //移动小于这个距离，认为怪物没动
const timeThreshold=2;   //等待多久后，认为怪物没动卡死

//怪物移动时候的碰撞盒子，设置过大容易过不去门，设置过小容易造成怪物钻进墙里的错觉
const Tracemins={x:-4,y:-4,z:1};
const Tracemaxs={x:4,y:4,z:4};
const groundCheckDist=8;//找地面时向下找多远
const surfaceEpsilon=4;//每次移动离碰撞面多远
//===================波次参数========================
const wavesConfig=[
        { 
            name: "训练波", 
            totalMonsters: 1000, 
            reward: 500, 
            spawnInterval: 3.0, 
            preparationTime: 0, //波次开始到第一个怪物出现时间
            aliveMonster:2, //同时存在的怪物数量
            monster_spawn_points_name:["lv1_zako_teleport_01","lv1_zako_teleport_02"],//这一波生成点
            monster_breakablemins:{x:-30,y:-30,z:0},//最大怪物的breakable的mins
            monster_breakablemaxs:{x:30,y:30,z:75},//最大怪物的breakable的maxs
            monsterTypes:[
                {
                    template_name:"headcrab_classic_template",
                    name: "Zombie",
                    baseHealth: 100,
                    baseDamage: 10,
                    speed: 150,
                    reward: 100,
                    attackdist:80,
                    movementmode:"OnGround",
                    skill_pool:[
                        //{
                        //    id:"pounce",//技能名称
                        //    chance: 1,//技能获得概率
                        //    params:{cooldowntime:5,distance:250,animation:"pounce"}
                        //},
                        //{
                        //    id:"speed_boost",//技能名称
                        //    chance: 0,//技能获得概率
                        //    params:{multiplier:1.3}
                        //},
                        //{
                        //    id: "hp_up",
                        //    chance: 0,
                        //    params: { value: 50 }
                        //},
                        //{
                        //    id: "shield",
                        //    chance: 0,
                        //    params: {cooldowntime:15,runtime:-1,value:50}
                        //}
                    ],
                    animations:{
                        "idle":[
                            "headcrab_classic_idle",
                            "headcrab_classic_idle_b",
                            "headcrab_classic_idle_c"
                        ],
                        "walk":[
                            "headcrab_classic_walk",
                            "headcrab_classic_run"
                        ],
                        "attack":[
                            "headcrab_classic_attack_antic_02",
                            "headcrab_classic_attack_antic_03",
                            "headcrab_classic_attack_antic_04"
                        ],
                        "skill":[
                            "headcrab_classic_attack_antic_02",
                            "headcrab_classic_attack_antic_03",
                            "headcrab_classic_attack_antic_04"
                        ],
                        "pounce":[
                            "headcrab_classic_jumpattack"
                        ]
                    }
                }
            ]
        },
    ];

class WaveManager {
    /**
     * @returns
     */
    constructor() {
        /** @type {number} */
        this.currentWave = 0;
        /** @type {string} */
        this.waveState = 'IDLE'; // IDLE, ACTIVE, COMPLETED
        /**
         * @type {any[]}
         */
        this.waves = []; // 波次配置数组
        this.onWaveComplete = null; // 波次完成回调
        this.onWaveStart = null; // 波次开始回调
        this.initDefaultWaves();

        this.wavepretick=-1;         //波次激活时间
        this.wavetime=0;             //波次激活到开始的时间
        this.waveenable=false;       //波次是否激活
    }
    // 设置回调
    /**
     * @param {(waveNumber: any, waveConfig: any) => void} callback
     */
    setOnWaveComplete(callback) {
        this.onWaveComplete = callback;
    }
    
    /**
     * @param {(waveNumber: any, waveConfig: any) => void} callback
     */
    setOnWaveStart(callback) {
        this.onWaveStart = callback;
    }
    // 初始化波次配置
    initDefaultWaves() {
        // 每波配置: { name, totalMonsters, reward, spawnInterval, preparationTime }
        this.waves = wavesConfig;
    }
    // 开始指定波次
    /**
     * @param {number} waveNumber
     */
    startWave(waveNumber) {
        if (this.waveState === 'ACTIVE') {
            Instance.Msg(`无法开始波次 ${waveNumber}，当前波次进行中`);
            return false;
        }
        
        if (waveNumber < 1 || waveNumber > this.waves.length) {
            Instance.Msg(`波次 ${waveNumber} 超出范围 (1-${this.waves.length})`);
            return false;
        }
        
        this.currentWave = waveNumber;
        this.waveState = 'ACTIVE';

        const wave = this.getCurrentWave();
        // 广播波次开始
        this.broadcastWaveStart(wave);
        
        this.wavepretick=Instance.GetGameTime();
        this.wavetime=wave.preparationTime;
        this.waveenable=true;

        return true;
    }
    // 获取当前波次信息
    getCurrentWave() {
        if (this.currentWave < 1 || this.currentWave > this.waves.length) {
            return null;
        }
        return this.waves[this.currentWave - 1];
    }
    // 获取下一波信息
    getNextWave() {
        const nextWave = this.currentWave + 1;
        if (nextWave > this.waves.length) {
            return null;
        }
        return this.waves[nextWave - 1];
    }
    // 是否有下一波
    hasNextWave() {
        return this.currentWave < this.waves.length;
    }
    
    // 获取总波次数
    getTotalWaves() {
        return this.waves.length;
    }
    
    // 获取波次进度
    getProgress() {
        return {
            current: this.currentWave,
            total: this.waves.length,
            state: this.waveState,
            wave: this.getCurrentWave()
        };
    }
    // 开始下一波
    nextWave() {
        if (this.currentWave >= this.waves.length) {
            Instance.Msg("所有波次已完成！");
            return false;
        }
        
        return this.startWave(this.currentWave + 1);
    }
    // 波次完成（由外部调用，例如怪物管理器）
    completeWave() {
        if (this.waveState !== 'ACTIVE') return false;
        
        this.waveState = 'COMPLETED';
        const wave = this.getCurrentWave();
        
        // 广播波次完成
        this.broadcastWaveComplete(wave);
        
        Instance.Msg(`第 ${this.currentWave} 波完成！奖励: $${wave?.reward??0}`);
        // 触发回调
        if (this.onWaveComplete) {
            this.onWaveComplete(this.currentWave, wave);
        }
        return true;
    }
    // 广播波次开始
    /**
     * @param {{ name: string; totalMonsters: number; reward: number; spawnInterval: number; preparationTime: number; monsterTypes: { name: string; baseHealth: number; baseDamage: number; speed: number; reward: number; }[]; } | null} wave
     */
    broadcastWaveStart(wave) {
        const message = `=== 第 ${this.currentWave} 波: ${wave?.name??-1} ===\n` +
                       `怪物总数: ${wave?.totalMonsters??-1}\n` +
                       `奖励: $${wave?.reward??-1}\n` +
                       `准备时间: ${wave?.preparationTime??-1} 秒`;
        this.broadcastMessage(message);
    }
    
    // 广播波次完成

    /**
     * @param {{ name: string; totalMonsters: number; reward: number; spawnInterval: number; preparationTime: number; monsterTypes: { name: string; baseHealth: number; baseDamage: number; speed: number; reward: number; }[]; } | null} wave
     */
    broadcastWaveComplete(wave) {
        const nextWave = this.getNextWave();
        let message = `=== 第 ${this.currentWave} 波完成 ===\n` +
                     `奖励: $${wave?.reward??-1}`;
        
        if (nextWave) {
            message += `\n下一波: ${nextWave.name} (${nextWave.totalMonsters} 怪物)`;
        } else {
            message += "\n=== 所有波次完成 ===";
        }
        
        this.broadcastMessage(message);
    }
    // 辅助方法
    /**
     * @param {string} message
     */
    broadcastMessage(message) {
        Instance.Msg(`[WaveManager] ${message}`);
        //Instance.ServerCommand(`say ${message}`);
    }

    // 重置波次
    resetGame() {
        this.currentWave = 0;
        this.waveState = 'IDLE';
        Instance.Msg("波次已重置");
    }
    
    tick()
    {
        if(this.waveenable)
        {
            const now=Instance.GetGameTime();
            if(now-this.wavepretick>=this.wavetime)
            {
                Instance.Msg(`=== 第 ${this.currentWave} 波开始===`);

                // 触发回调
                if (this.onWaveStart) {
                    this.onWaveStart(this.currentWave, this.getCurrentWave());
                }
            }
            this.waveenable=false;
        }
    }
}

class vec{
    /**
     * 返回向量vec1+vec2
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     * @returns {import("cs_script/point_script").Vector}
     */
    static add(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    }
    /**
     * 添加 2D 分量
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     * @returns {import("cs_script/point_script").Vector}
     */
    static add2D(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: a.z};
    }
    /**
     * 返回向量vec1-vec2
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     * @returns {import("cs_script/point_script").Vector}
     */
    static sub(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    }
    /**
     * 返回向量vec1*s
     * @param {import("cs_script/point_script").Vector} a
     * @param {number} s
     * @returns {import("cs_script/point_script").Vector}
     */
    static scale(a,s)
    {
        return {x:a.x*s,y:a.y*s,z:a.z*s}
    }
    /**
     * 返回向量vec1*s
     * @param {import("cs_script/point_script").Vector} a
     * @param {number} s
     * @returns {import("cs_script/point_script").Vector}
     */
    static scale2D(a,s) {
        return {
            x:a.x * s,
            y:a.y * s,
            z:a.z
        };
    }
    /**
     * 得到vector
     * @param {number} [x]
     * @param {number} [y]
     * @param {number} [z]
     * @returns {import("cs_script/point_script").Vector}
     */
    static get(x=0,y=0,z=0)
    {
        return {x,y,z};
    }
    /**
     * 深复制
     * @param {import("cs_script/point_script").Vector} a
     * @returns {import("cs_script/point_script").Vector}
     */
    static clone(a)
    {
        return {x:a.x,y:a.y,z:a.z};
    }
    /**
     * 计算空间两点之间的距离
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} [b]
     * @returns {number}
     */
    static length(a, b={x:0,y:0,z:0}) {
        const dx = a.x - b.x; const dy = a.y - b.y; const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    /**
     * 计算xy平面两点之间的距离
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} [b]
     * @returns {number}
     */
    static length2D(a, b={x:0,y:0,z:0}) {
        const dx = a.x - b.x; const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    /**
     * 返回pos上方height高度的点
     * @param {import("cs_script/point_script").Vector} pos
     * @param {number} height
     * @returns {import("cs_script/point_script").Vector}
     */
    static Zfly(pos, height) {
        return { x: pos.x, y: pos.y, z: pos.z + height };
    }
    /**
     * 输出点pos的坐标
     * @param {import("cs_script/point_script").Vector} pos
     */
    static msg(pos) {
        Instance.Msg(`{${pos.x} ${pos.y} ${pos.z}}`);
    }
    /**
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     */
    static dot(a,b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    /**
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     */
    static dot2D(a,b) {
        return a.x * b.x + a.y * b.y;
    }

    /**
     * @param {import("cs_script/point_script").Vector} a
     * @param {import("cs_script/point_script").Vector} b
     */
    static cross(a,b) {
        return {
            x:a.y * b.z - a.z * b.y,
            y:a.z * b.x - a.x * b.z,
            z:a.x * b.y - a.y * b.x
        };
    }
    /**
     * @param {import("cs_script/point_script").Vector} a
     */
    static normalize(a) {
        const len = this.length(a);
        if (len < 1e-6) {
            return {x:0,y:0,z:0};
        }
        return this.scale(a,1 / len);
    }
    /**
     * @param {import("cs_script/point_script").Vector} a
     */
    static normalize2D(a) {
        const len = this.length2D(a);
        if (len < 1e-6) {
            return {x:0,y:0,z:0};
        }
        return {
            x:a.x / len,
            y:a.y / len,
            z:0
        };
    }
    /**
     * @param {import("cs_script/point_script").Vector} a
     */
    static isZero(a) {
        return (
            Math.abs(a.x) < 1e-6 &&
            Math.abs(a.y) < 1e-6 &&
            Math.abs(a.z) < 1e-6
        );
    }
}

class AIMoveProbe {
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

class AIStuckMonitor {
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

class AIMotor {
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
        vec.scale(vec.normalize2D(wishDir),wishSpeed);
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

class PathFollower {
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

class MoveMode {
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
class MoveWalk extends MoveMode {
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
class MoveAir extends MoveMode {
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
class MoveFly extends MoveMode {
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
class MovePounce extends MoveMode {
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

class MovementController {
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

const PathState = {
    JUMP: 2,//下一个点需要跳跃
};
class NPCLocomotion {
    /**
     * @param {Entity} entity
     * @param {Monster} monster
     */
    constructor(monster,entity) {
        this.monster=monster;
        this.entity = entity;
        // 核心组件
        this.motor = new AIMotor(entity);
        this.pathFollower = new PathFollower();

        // 输入（由 AI / Path 决定）
        this.wishDir = vec.get(0,0,0);
        this.wishSpeed = 0;
        
        //基础属性
        this.maxSpeed = 120;       // 怪物速度

        // 状态缓存
        this._isStopped = true;

        this.controller = new MovementController(this);
        this.controller.setMode("walk");
    }
    getposV3()
    {
        return vec.clone(this.entity.GetAbsOrigin());
    }
    /**
     * 设置一条导航路径
     * @param {{ pos: import("cs_script/point_script").Vector; mode: number; }[]} path
     */
    setPath(path) {
        this.pathFollower.setPath(path);
    }
    resume()
    {
        this._isStopped = false;
    }
    /**
     * 强制停止（例如攻击 / 撞击）
     */
    stop() {
        this.wishDir=vec.get(0,0,0);
        this.wishSpeed = 0;
        this.motor.stop();
        this._isStopped = true;
    }
    /**
     * 每帧更新（唯一入口）
     * @param {number} dt
     * @param {Entity[]} mpos
     */
    update(dt,mpos) {
        this.maxSpeed=this.monster.speed;//先实时更新速度
        //this.arriveDistance=Math.max(1,this.monster.attackdist-5);
        if (this._isStopped) return;
        this.controller.update(dt, mpos);
    }

    /**
     * 计算期望方向与速度
     * 这是 Source 里非常“干净”的一层
     * 得到
     * 一个 wishDir（2D 方向）
     * 一个 wishSpeed（理想速度）
     * @param {{pos: import("cs_script/point_script").Vector; mode: number;}|null} goalPos
     */
    _computeWish(goalPos) {
        if(!goalPos)
        {
            this.wishDir=vec.get(0,0,0);
            this.wishSpeed = this.maxSpeed;
            return;
        }
        const pos = this.getposV3();

        const toGoal = vec.sub(goalPos.pos,pos);
        const dist = vec.length(toGoal);
        if(goalPos.mode==PathState.JUMP)
        {
            //暂定========================================
            // 已经非常接近 → 停止
            if (dist <= arriveDistance) {
                this.wishDir=vec.get(0,0,0);
                this.wishSpeed = this.maxSpeed;
                return;
            }
            
            this.wishDir=vec.normalize(toGoal);
            this.wishSpeed = 250;
        }
        else
        {
            // 已经非常接近 → 停止
            if (dist <= arriveDistance) {
                this.wishDir=vec.get(0,0,0);
                this.wishSpeed = this.maxSpeed;
                return;
            }
            // 2d方向
            this.wishDir=vec.normalize2D(toGoal);

            // Source 风格：不在 Locomotion 里搞复杂加速曲线
            this.wishSpeed = this.maxSpeed;
        }
    }

    // 当前是否在地面
    isOnGround() {
        return this.motor.isOnGround();
    }
    // 当前速度
    getVelocity() {
        return this.motor.getVelocity();
    }
    //是否正在移动
    isMoving() {
        return !this._isStopped && this.wishSpeed > 0;
    }
}

class MonsterAnimator {
    /**
     * @param {Entity} model
     * @param {any} typeConfig
     */
    constructor(model, typeConfig) {
        this.model = model;
        this.animConfig = typeConfig.animations;
        this.locked = false;// 是否处于动作占用期
        this.currentstats=-1;// 当前动画对应的 MonsterState
        //攻击结束回调
        this.onAttackFinish=null;

        Instance.ConnectOutput(this.model,"OnAnimationDone",(e)=>{
            //动画播放完了
            this.locked = false;
            this.onStateFinish?.(this.currentstats);
        });
    }
    /**
     * @param {(state: number) => void} callback
     */
    setonStateFinish(callback)
    {
        this.onStateFinish=callback;
    }
    /**
     * @param {number} state
     */
    tick(state) {
        if (this.locked) return;
        this.currentstats=state;
        switch (state) {
            case MonsterState.IDLE:
                this.play("idle");
                break;
            case MonsterState.CHASE:
                this.play("walk");
                break;
            case MonsterState.ATTACK:
                this.play("attack");
                break;
            case MonsterState.SKILL:
                this.play("skill");
                break;
            case MonsterState.DEAD:
                this.play("dead");
                break;
        }
    }
    /**
     * Animator 是否允许切换到 nextState
     * @param {number} nextState - MonsterState
     */
    canSwitch(nextState) {
        Instance.GetGameTime();
        if (!this.locked) {
            return true;
        }
        if (this.currentstats==MonsterState.ATTACK||this.currentstats==MonsterState.SKILL) {
            return false;
        }
        return true;
    }
    /**
     * 强制播放
     * @param {number} nextState
     */
    enter(nextState) {
        this.currentstats=nextState;
        switch (nextState) {
            case MonsterState.IDLE:
                this.play("idle");
                break;
            case MonsterState.CHASE:
                this.play("walk");
                break;
            case MonsterState.ATTACK:
                this.play("attack");
                break;
            case MonsterState.SKILL:
                this.play("skill");
                break;
            case MonsterState.DEAD:
                this.play("dead");
                break;
        }
    }
    /**
     * @param {string} type
     */
    play(type) {
        const list = this.animConfig[type];
        if (!list || list.length === 0) return null;
        const anim = list[Math.floor(Math.random() * list.length)];
        if (!anim) return;
        Instance.EntFireAtTarget({target:this.model,input:"SetAnimation",value:anim});
        this.locked=true;
    }
}

const ASTAR_HEURISTIC_SCALE = 1.2;                         //A*推荐数值
//Funnel参数
const FUNNEL_DISTANCE = 12;                                //拉直的路径距离边缘多远(0-100，百分比，100%意味着只能走边的中点)
//高度修正参数
const ADJUST_HEIGHT_DISTANCE = 50;                        //路径中每隔这个距离增加一个点，用于修正高度
/**
 * xy平面上点abc构成的三角形面积的两倍，>0表示ABC逆时针，<0表示顺时针
 * @param {import("cs_script/point_script").Vector} a
 * @param {import("cs_script/point_script").Vector} b
 * @param {import("cs_script/point_script").Vector} c
 */
function area(a, b, c) {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ac = { x: c.x - a.x, y: c.y - a.y };
    const s2 = (ab.x * ac.y - ac.x * ab.y);
    return s2;
}
/**
 * 点到线段最近点
 * @param {import("cs_script/point_script").Vector} p
 * @param {import("cs_script/point_script").Vector} a
 * @param {import("cs_script/point_script").Vector} b
 */
function closestPointOnSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;

    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const apz = p.z - a.z;

    const d = abx * abx + aby * aby + abz * abz;
    let t = d > 0 ? (apx * abx + apy * aby + apz * abz) / d : 0;
    t = Math.max(0, Math.min(1, t));

    return {
        x: a.x + abx * t,
        y: a.y + aby * t,
        z: a.z + abz * t,
    };
}
/**
 * 点是否在凸多边形内(xy投影)
 * @param {import("cs_script/point_script").Vector} p
 * @param {import("cs_script/point_script").Vector[]} verts
 * @param {number[]} poly
 */
function pointInConvexPolyXY(p, verts, poly) {
    for (let i = 0; i < poly.length; i++) {
        const a = verts[poly[i]];
        const b = verts[poly[(i + 1) % poly.length]];
        if (area(a, b, p) < 0) return false;
    }
    return true;
}
/**
 * 点到 polygon 最近点(xy投影)
 * @param {import("cs_script/point_script").Vector} pos
 * @param {import("cs_script/point_script").Vector[]} verts
 * @param {number[]} poly
 */
function closestPointOnPoly(pos, verts, poly) {
    // 1. 如果在多边形内部（XY），直接投影到平面
    if (pointInConvexPolyXY(pos, verts, poly)) {
        // 用平均高度（你也可以用平面方程）
        let maxz = -Infinity,minz=Infinity;
        for (const vi of poly)
        {
            maxz =Math.max(maxz,verts[vi].z);
            minz =Math.min(minz,verts[vi].z);
        }

        return { x: pos.x, y: pos.y, z:0,in:true};
    }

    // 2. 否则，找最近边
    let best = null;
    let bestDist = Infinity;

    for (let i = 0; i < poly.length; i++) {
        const a = verts[poly[i]];
        const b = verts[poly[(i + 1) % poly.length]];
        const c = closestPointOnSegment(pos, a, b);

        const dx = c.x - pos.x;
        const dy = c.y - pos.y;
        const dz = c.z - pos.z;
        const d = dx * dx + dy * dy + dz * dz;

        if (d < bestDist) {
            bestDist = d;
            best = {x: c.x, y: c.y, z:c.z,in:false};
        }
    }

    return best;
}

class FunnelHeightFixer {
    /**
     * @param {{verts:import("cs_script/point_script").Vector[],polys:number[][]}} navMesh
     * @param {{verts:{x:number,y:number,z:number}[], tris:number[][],meshes:number[][], triTopoly:number[]}} detailMesh
     * @param {number} stepSize
     */
    constructor(navMesh, detailMesh, stepSize = 0.5) {
        this.navMesh = navMesh;
        this.detailMesh = detailMesh;
        this.stepSize = stepSize;
        const polyCount = detailMesh.meshes.length;
        this.polyTriStart = new Uint16Array(polyCount);
        this.polyTriEnd   = new Uint16Array(polyCount);
        this.polyHasDetail = new Uint8Array(polyCount);
        for (let i = 0; i < polyCount; i++) {
            const mesh = detailMesh.meshes[i];
            const baseTri  = mesh[2];
            const triCount = mesh[3];
            this.polyHasDetail[i] = (triCount > 0)?1:0;
            this.polyTriStart[i] = baseTri;
            this.polyTriEnd[i]   = baseTri + triCount; // [start, end)
        }
        this.triAabbMinX = [];
        this.triAabbMinY = [];
        this.triAabbMaxX = [];
        this.triAabbMaxY = [];
        const { verts, tris } = detailMesh;

        for (let i = 0; i < tris.length; i++) {
            const [ia, ib, ic] = tris[i];
            const a = verts[ia];
            const b = verts[ib];
            const c = verts[ic];

            const minX = Math.min(a.x, b.x, c.x);
            const minY = Math.min(a.y, b.y, c.y);
            const maxX = Math.max(a.x, b.x, c.x);
            const maxY = Math.max(a.y, b.y, c.y);

            this.triAabbMinX[i] = minX;
            this.triAabbMinY[i] = minY;
            this.triAabbMaxX[i] = maxX;
            this.triAabbMaxY[i] = maxY;
        }

    }

    /* ===============================
       Public API
    =============================== */
    
    /**
     * @param {{ x: number; y: number; z: any; }} pos
     * @param {number} polyid
     * @param {{ id: number; mode: number; }[]} polyPath
     * @param {{ pos: { x: number; y: number; z: number; }; mode: number; }[]} out
     */
    addpoint(pos,polyid,polyPath,out)
    {
        while (polyid < polyPath.length &&!this._pointInPolyXY(pos, polyPath[polyid].id))polyid++;

        if (polyid >= polyPath.length) return;
        const h = this._getHeightOnDetail(polyPath[polyid].id, pos);
        out.push({
            pos: { x: pos.x, y: pos.y, z: h },
            mode: 1
        });
        //Instance.DebugSphere({center:{ x: pos.x, y: pos.y, z: h },radius:1,duration:1/32,color:{r:0,g:255,b:0}});
                
    }
    /**
     * @param {{pos:{x:number,y:number,z:number},mode:number}[]} funnelPath
     * @param {{id:number,mode:number}[]} polyPath
     */
    fixHeight(funnelPath,polyPath) {
        if (funnelPath.length === 0) return [];
        const result = [];
        let polyIndex = 0;

        for (let i = 0; i < funnelPath.length - 1; i++) {
            const curr = funnelPath[i];
            const next = funnelPath[i + 1];

            // 跳点：直接输出，不插值
            if (next.mode == 2) {
                result.push(curr);
                continue;
            }
            if(curr.mode == 2)result.push(curr);
            // 分段采样
            const samples = this._subdivide(curr.pos, next.pos);
            //Instance.Msg(samples.length);
            let preh=curr.pos.z;
            let prep=curr;
            for (let j = (curr.mode == 2)?1:0; j < samples.length; j++) {
                const p = samples[j];
                // 跳过重复首点
                //if (result.length > 0) {
                //    const last = result[result.length - 1].pos;
                //    if (posDistance2Dsqr(last, p) < 1e-4) continue;
                //}
                const preid=polyIndex;
                // 推进 poly corridor
                while (polyIndex < polyPath.length &&!this._pointInPolyXY(p, polyPath[polyIndex].id))polyIndex++;

                if (polyIndex >= polyPath.length) break;
                //如果这个样本点比前一个点高度发生足够变化，就在中间加入一个样本点
                const h = this._getHeightOnDetail(polyPath[polyIndex].id, p);
                if(j>0&&Math.abs(preh-h)>5)
                {
                    const mid={x:(p.x+prep.pos.x)/2,y:(p.y+prep.pos.y)/2,z:p.z};
                    this.addpoint(mid,preid,polyPath,result);
                }
                result.push({
                    pos: { x: p.x, y: p.y, z: h },
                    mode: 1
                });
                //Instance.DebugSphere({center:{ x: p.x, y: p.y, z: h },radius:1,duration:1/32,color:{r:255,g:0,b:0}});
                preh=h;
                prep=result[result.length - 1];
            }
        }
        return result;
    }

    /* ===============================
       Subdivide
    =============================== */

    /**
     * @param {{ x: any; y: any; z: any; }} a
     * @param {{ x: any; y: any; z?: number; }} b
     */
    _subdivide(a, b) {
        const out = [];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= this.stepSize) {
            out.push(a);
            return out;
        }

        const n = Math.floor(dist / this.stepSize);
        for (let i = 0; i < n; i++) {
            const t = i / n;
            out.push({
                x: a.x + dx * t,
                y: a.y + dy * t,
                z: a.z
            });
        }
        return out;
    }

    /* ===============================
       Height Query
    =============================== */

    /**
     * @param {number} polyId
     * @param {{ z: number; y: number; x: number; }} p
     */
    _getHeightOnDetail(polyId, p) {
        const { verts, tris } = this.detailMesh;
        const start = this.polyTriStart[polyId];
        const end   = this.polyTriEnd[polyId];
        if(this.polyHasDetail[polyId]==0)return p.z;
        const px = p.x;
        const py = p.y;
        for (let i = start; i < end; i++) {
            if (
                px < this.triAabbMinX[i] || px > this.triAabbMaxX[i] ||
                py < this.triAabbMinY[i] || py > this.triAabbMaxY[i]
            ) {
                continue;
            }
            const [a, b, c] = tris[i];
            const va = verts[a];
            const vb = verts[b];
            const vc = verts[c];

            if (this._pointInTriXY(p, va, vb, vc)) {
                return this._baryHeight(p, va, vb, vc);
            }
        }

        // fallback（极少发生）
    return p.z;
    }

    /**
     * @param {{ x: number; y: number; }} p
     * @param {{ x: any; y: any; z: any; }} a
     * @param {{ x: any; y: any; z: any; }} b
     * @param {{ x: any; y: any; z: any; }} c
     */
    _baryHeight(p, a, b, c) {
        const v0x = b.x - a.x, v0y = b.y - a.y;
        const v1x = c.x - a.x, v1y = c.y - a.y;
        const v2x = p.x - a.x, v2y = p.y - a.y;

        const d00 = v0x * v0x + v0y * v0y;
        const d01 = v0x * v1x + v0y * v1y;
        const d11 = v1x * v1x + v1y * v1y;
        const d20 = v2x * v0x + v2y * v0y;
        const d21 = v2x * v1x + v2y * v1y;

        const denom = d00 * d11 - d01 * d01;
        const v = (d11 * d20 - d01 * d21) / denom;
        const w = (d00 * d21 - d01 * d20) / denom;
        const u = 1.0 - v - w;

        return u * a.z + v * b.z + w * c.z;
    }

    /* ===============================
       Geometry helpers
    =============================== */

    /**
     * @param {{ y: number; x: number; z:0}} p
     * @param {number} polyId
     */
    _pointInPolyXY(p, polyId) {
        const poly = this.navMesh.polys[polyId];
        return pointInConvexPolyXY(p,this.navMesh.verts,poly);
    }
    /**
     * @param {{ y: number; x: number; }} p
     * @param {{ x: number; y: number;}} a
     * @param {{ x: number; y: number;}} b
     * @param {{ x: number; y: number;}} c
     */
    _pointInTriXY(p, a, b, c) {
        const s = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
        const t = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        const u = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
        return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0);
    }
}

class PolyGraphAStar {
    /**
     * @param {{verts: {x: number;y: number;z: number;}[];polys: number[][];regions: number[];neighbors: number[][];}} polys
     * @param {{PolyA: number;PolyB: number;PosA: import("cs_script/point_script").Vector;PosB: import("cs_script/point_script").Vector;cost: number;type: number;}[]} links
     * @param {FunnelHeightFixer} heightfixer
     */
    constructor(polys, links, heightfixer) {
        this.mesh = polys;
        this.polyCount = polys.polys.length;
        /**@type {Map<number,{PolyA: number; PolyB: number; PosA: import("cs_script/point_script").Vector; PosB: import("cs_script/point_script").Vector; cost: number; type: number;}[]>} */
        this.links = new Map();
        this.heightfixer = heightfixer;
        for (const link of links) {
            const polyA = link.PolyA;
            const polyB = link.PolyB;
            if (!this.links.has(polyA)) this.links.set(polyA, []);
            if (!this.links.has(polyB)) this.links.set(polyB, []);
            this.links.get(polyA)?.push(link);
            this.links.get(polyB)?.push(link);
        }
        //预计算中心点
        this.centers = new Array(this.polyCount);
        for (let i = 0; i < this.polyCount; i++) {
            const poly = this.mesh.polys[i];
            let x = 0, y = 0, z = 0;
            for (const vi of poly) {
                const v = this.mesh.verts[vi];
                x += v.x; y += v.y; z += v.z;
            }
            const n = poly.length;
            this.centers[i] = {
                x: x / n, y: y / n, z: z / n
            };
        }

        this.heuristicScale = ASTAR_HEURISTIC_SCALE;
        Instance.Msg("多边形总数：" + this.polyCount + "跳点数：" + links.length);
        this.open = new MinHeap$1(this.polyCount);

        //查询所在多边形优化
        this.spatialCellSize = 256;
        this.spatialGrid = new Map();
        this.buildSpatialIndex();
    }

    /**
     * @param {import("cs_script/point_script").Vector} start
     * @param {import("cs_script/point_script").Vector} end
     */
    findPath(start, end) {
        const startPoly = this.findNearestPoly(start);
        const endPoly = this.findNearestPoly(end);
        //Instance.Msg(startPoly.poly+"   "+endPoly.poly);
        if (startPoly.poly < 0 || endPoly.poly < 0) {
            Instance.Msg(`跑那里去了?`);
            return { start: startPoly.pos, end: endPoly.pos, path: [] };
        }

        if (startPoly == endPoly) {
            return { start: startPoly.pos, end: endPoly.pos, path: [{ id: endPoly.poly, mode: 1 }] };
        }
        return { start: startPoly.pos, end: endPoly.pos, path: this.findPolyPath(startPoly.poly, endPoly.poly) };
    }
    buildSpatialIndex() {
        for (let i = 0; i < this.mesh.polys.length; i++) {
            const poly = this.mesh.polys[i];

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const vi of poly) {
                const v = this.mesh.verts[vi];
                if (v.x < minX) minX = v.x;
                if (v.y < minY) minY = v.y;
                if (v.x > maxX) maxX = v.x;
                if (v.y > maxY) maxY = v.y;
            }

            const x0 = Math.floor(minX / this.spatialCellSize);
            const x1 = Math.ceil(maxX / this.spatialCellSize);
            const y0 = Math.floor(minY / this.spatialCellSize);
            const y1 = Math.ceil(maxY / this.spatialCellSize);

            for (let x = x0; x <= x1; x++) {
                for (let y = y0; y <= y1; y++) {
                    const key = `${x}_${y}`;
                    if (!this.spatialGrid.has(key)) this.spatialGrid.set(key, []);
                    this.spatialGrid.get(key).push(i);
                }
            }
        }
    }
    /**
     * 返回包含点的 poly index，找不到返回 -1
     * @param {{x:number,y:number,z:number}} p
     */
    findNearestPoly(p) {
        let bestPoly = -1;
        let bestDist = Infinity;
        let bestPos = p;
        const x = Math.floor(p.x / this.spatialCellSize);
        const y = Math.floor(p.y / this.spatialCellSize);
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const key = `${x + i}_${y + j}`;
                //const key = `${x}_${y}`;
                const candidates = this.spatialGrid.get(key);
                if (!candidates) continue;
                //if (!candidates) return{pos:bestPos,poly:bestPoly};
                for (const polyIdx of candidates) {
                    const poly = this.mesh.polys[polyIdx];
                    const cp = closestPointOnPoly(p, this.mesh.verts, poly);
                    if (!cp) continue;

                    if (cp.in == true) {
                        const h = this.heightfixer._getHeightOnDetail(polyIdx, p);
                        cp.z = h;
                    }
                    //Instance.DebugSphere({center:{x:cp.x,y:cp.y,z:cp.z},radius:2,duration:1,color:{r:255,g:0,b:0}});
                    const dx = cp.x - p.x;
                    const dy = cp.y - p.y;
                    const dz = cp.z - p.z;
                    const d = dx * dx + dy * dy + dz * dz;

                    if (d < bestDist) {
                        bestDist = d;
                        bestPoly = polyIdx;
                        bestPos = cp;
                    }
                }
            }
        }

        return { pos: bestPos, poly: bestPoly };
    }
    /**
     * @param {number} start
     * @param {number} end
     */
    findPolyPath(start, end) {
        const open = this.open;
        const g = new Float32Array(this.polyCount);
        const parent = new Int32Array(this.polyCount);
        const walkMode = new Uint8Array(this.polyCount);// 0=none,1=walk,2=jump,//待更新3=climb
        const state = new Uint8Array(this.polyCount); // 0=none,1=open,2=closed
        g.fill(Infinity);
        parent.fill(-1);
        open.clear();
        g[start] = 0;
        // @ts-ignore
        open.push(start, this.distsqr(start, end) * this.heuristicScale);
        state[start] = 1;

        let closestNode = start;
        let minH = Infinity;

        while (!open.isEmpty()) {
            const current = open.pop();

            if (current === end) return this.reconstruct(parent, walkMode, end);
            state[current] = 2;

            const hToTarget = this.distsqr(current, end);
            if (hToTarget < minH) {
                minH = hToTarget;
                closestNode = current;
            }

            const neighbors = this.mesh.neighbors[current];
            for (let i = 0; i < neighbors.length; i++) {
                const n = neighbors[i];
                if (n < 0 || state[n] == 2) continue;
                // @ts-ignore
                const tentative = g[current] + this.distsqr(current, n);
                if (tentative < g[n]) {
                    parent[n] = current;
                    walkMode[n] = 1;
                    g[n] = tentative;
                    // @ts-ignore
                    const f = tentative + this.distsqr(n, end) * this.heuristicScale;
                    if (state[n] != 1) {
                        open.push(n, f);
                        state[n] = 1;
                    }
                    else open.update(n, f);
                }
            }
            if (!this.links.has(current)) continue;
            // @ts-ignore
            for (const link of this.links.get(current)) {
                let v = -1;
                if (link.PolyA == current) v = link.PolyB;
                else if (link.PolyB == current) v = link.PolyA;
                if (v == -1 || state[v] == 2) continue;
                const moveCost = link.cost * link.cost;
                if (g[current] + moveCost < g[v]) {
                    g[v] = g[current] + moveCost;
                    // @ts-ignore
                    const f = g[v] + this.distsqr(v, end) * this.heuristicScale;
                    parent[v] = current;
                    walkMode[v] = 2;
                    if (state[v] != 1) {
                        open.push(v, f);
                        state[v] = 1;
                    }
                    else open.update(v, f);
                }
            }
        }
        return this.reconstruct(parent, walkMode, closestNode);
    }
    /**
     * @param {Int32Array} parent
     * @param {Uint8Array} walkMode
     * @param {number} cur
     */
    reconstruct(parent, walkMode, cur) {
        const path = [];
        while (cur !== -1) {
            path.push({ id: cur, mode: walkMode[cur] });
            cur = parent[cur];
        }
        return path.reverse();
    }

    /**
     * @param {number} a
     * @param {number} b
     */
    distsqr(a, b) {
        const pa = this.centers[a];
        const pb = this.centers[b];
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dz = pa.z - pb.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}
let MinHeap$1 = class MinHeap {
    /**
     * @param {number} polyCount
     */
    constructor(polyCount) {
        this.nodes = new Int32Array(polyCount);
        this.costs = new Float32Array(polyCount);
        this.index = new Int32Array(polyCount).fill(-1);
        this.size = 0;
    }
    clear() {
        this.index.fill(-1);
        this.size = 0;
    }
    isEmpty() {
        return this.size === 0;
    }

    /**
     * @param {number} node
     * @param {number} cost
     */
    push(node, cost) {
        let i = this.size++;
        this.nodes[i] = node;
        this.costs[i] = cost;
        this.index[node] = i;
        this._up(i);
    }

    pop() {
        if (this.size === 0) return -1;
        const topNode = this.nodes[0];
        this.index[topNode] = -1;
        this.size--;
        if (this.size > 0) {
            this.nodes[0] = this.nodes[this.size];
            this.costs[0] = this.costs[this.size];
            this.index[this.nodes[0]] = 0;
            this._down(0);
        }
        return topNode;
    }

    /**
     * @param {number} node
     * @param {number} cost
     */
    update(node, cost) {
        const i = this.index[node];
        if (i == null) return;
        this.costs[i] = cost;
        this._up(i);
    }

    /**
     * @param {number} i
     */
    _up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.costs[p] <= this.costs[i]) break;
            this._swap(i, p);
            i = p;
        }
    }

    /**
     * @param {number} i
     */
    _down(i) {
        const n = this.size;
        while (true) {
            let l = i * 2 + 1;
            let r = l + 1;
            let m = i;

            if (l < n && this.costs[l] < this.costs[m]) m = l;
            if (r < n && this.costs[r] < this.costs[m]) m = r;
            if (m === i) break;

            this._swap(i, m);
            i = m;
        }
    }

    /**
     * @param {number} a
     * @param {number} b
     */
    _swap(a, b) {
        const ca = this.costs[a];
        const cb = this.costs[b];
        const na = this.nodes[a];
        const nb = this.nodes[b];
        this.costs[a] = cb;
        this.costs[b] = ca;
        this.nodes[a] = nb;
        this.nodes[b] = na;
        this.index[na] = b;
        this.index[nb] = a;
    }
};

class FunnelPath {
    /**
     * @param {{verts:import("cs_script/point_script").Vector[],polys:number[][],regions:number[],neighbors:number[][]}} mesh
     * @param {import("cs_script/point_script").Vector[]} centers
     * @param {{ PolyA: number; PolyB: number; PosA: import("cs_script/point_script").Vector; PosB: import("cs_script/point_script").Vector; cost: number; type: number; }[]} links
     */
    constructor(mesh, centers, links) {
        this.mesh = mesh;
        this.centers = centers;
        /**@type {Map<number,{PolyA: number; PolyB: number; PosA: import("cs_script/point_script").Vector; PosB: import("cs_script/point_script").Vector; cost: number; type: number;}[]>} */
        this.links = new Map();
        for (const link of links) {
            const polyA = link.PolyA;
            const polyB = link.PolyB;
            if (!this.links.has(polyA)) this.links.set(polyA, []);
            if (!this.links.has(polyB)) this.links.set(polyB, []);
            this.links.get(polyA)?.push(link);
            this.links.get(polyB)?.push(link);
        }
        //Instance.Msg(this.links.size);
    }
    //返回pA到pB的跳点
    /**
     * @param {number} polyA
     * @param {number} polyB
     */
    getlink(polyA, polyB) {
        // @ts-ignore
        for (const link of this.links.get(polyA)) {
            if (link.PolyB == polyB) return { start: link.PosB, end: link.PosA };
            if(link.PolyA == polyB)return { start: link.PosA, end: link.PosB };
        }
    }
    /**
     * @param {{id:number,mode:number}[]} polyPath
     * @param {import("cs_script/point_script").Vector} startPos
     * @param {import("cs_script/point_script").Vector} endPos
     */
    build(polyPath, startPos, endPos) {
        if (!polyPath || polyPath.length === 0) return [];
        if (polyPath.length === 1) return [{pos:startPos,mode:1}, {pos:endPos,mode:1}];
        const ans = [];
        // 当前这一段行走路径的【起点坐标】
        let currentSegmentStartPos = startPos;
        // 当前这一段行走路径的【多边形起始索引】（在 polyPath 中的 index）
        let segmentStartIndex = 0;
        for (let i = 1; i < polyPath.length; i++) {
            const prevPoly = polyPath[i - 1];
            const currPoly = polyPath[i];
            if (polyPath[i].mode == 2)//到第i个多边形需要跳跃，那就拉直最开始到i-1的路径
            {
                // 1. 获取跳点坐标信息
                const linkInfo = this.getlink(currPoly.id,prevPoly.id);
                if (!linkInfo)continue;
                const walkPathSegment = polyPath.slice(segmentStartIndex, i);
                const portals = this.buildPortals(walkPathSegment, currentSegmentStartPos, linkInfo.start, FUNNEL_DISTANCE);
                const smoothedWalk = this.stringPull(portals);
                for (const p of smoothedWalk) ans.push({pos:p,mode:1});
                ans.push({pos:linkInfo.end,mode:2});
                currentSegmentStartPos = linkInfo.end; // 下一段从落地点开始走
                segmentStartIndex = i; // 下一段多边形从 currPoly 开始
            }
        }
        const lastWalkSegment = polyPath.slice(segmentStartIndex, polyPath.length);
        const lastPortals = this.buildPortals(lastWalkSegment, currentSegmentStartPos, endPos, FUNNEL_DISTANCE);
        const lastSmoothed = this.stringPull(lastPortals);

        for (const p of lastSmoothed) ans.push({pos:p,mode:1});
        return this.removeDuplicates(ans);
    }
    /**
     * 简单的去重，防止相邻点坐标完全一样
     * @param {{pos:{x:number,y:number,z:number},mode:number}[]} path
     */
    removeDuplicates(path) {
        if (path.length < 2) return path;
        const res = [path[0]];
        for (let i = 1; i < path.length; i++) {
            const last = res[res.length - 1];
            const curr = path[i];
            const d = (last.pos.x - curr.pos.x) ** 2 + (last.pos.y - curr.pos.y) ** 2 + (last.pos.z - curr.pos.z) ** 2;
            // 容差极小值
            if (d > 0.001) {
                res.push(curr);
            }
        }
        return res;
    }
    /* ===============================
       Portal Construction
    =============================== */

    /**
     * @param {{id:number,mode:number}[]} polyPath
     * @param {import("cs_script/point_script").Vector} startPos
     * @param {import("cs_script/point_script").Vector} endPos
     * @param {number} funnelDistance
     */
    buildPortals(polyPath, startPos, endPos, funnelDistance) {
        const portals = [];

        // 起点
        portals.push({ left: startPos, right: startPos });
        for (let i = 0; i < polyPath.length - 1; i++) {
            const a = polyPath[i].id;
            const b = polyPath[i + 1].id;
            const por = this.findPortal(a, b, funnelDistance);
            if (!por) continue;
            portals.push(por);
        }
        // 终点
        portals.push({ left: endPos, right: endPos });
        return portals;
    }

    /**
     * 寻找两个多边形的公共边
     * @param {number} pa
     * @param {number} pb
     * @param {number} funnelDistance
     */
    findPortal(pa, pb, funnelDistance) {
        const poly = this.mesh.polys[pa];
        const neigh = this.mesh.neighbors[pa];

        for (let ei = 0; ei < neigh.length; ei++) {
            if (neigh[ei] !== pb) continue;

            const v0 = this.mesh.verts[poly[ei]];
            const v1 = this.mesh.verts[poly[(ei + 1) % poly.length]];

            // 统一左右（从 pa 看向 pb）
            const ca = this.centers[pa];
            const cb = this.centers[pb];

            if (this.triArea2(ca, cb, v0) < 0) {
                return this._applyFunnelDistance(v0, v1, funnelDistance);
            } else {
                return this._applyFunnelDistance(v1, v0, funnelDistance);
            }
        }
    }
    /**
     * 根据参数收缩门户宽度
     * @param {import("cs_script/point_script").Vector} left 
     * @param {import("cs_script/point_script").Vector} right 
     * @param {number} distance 0-100
     */
    _applyFunnelDistance(left, right, distance) {
        // 限制在 0-100
        const t = Math.max(0, Math.min(100, distance)) / 100.0;

        // 如果 t 是 0，保持原样（虽然前面判断过了，这里做个安全兜底）
        if (t === 0) return { left, right };

        // 计算中点
        const midX = (left.x + right.x) * 0.5;
        const midY = (left.y + right.y) * 0.5;
        const midZ = (left.z + right.z) * 0.5;
        const mid = { x: midX, y: midY, z: midZ };

        // 使用线性插值将端点向中点移动
        // t=0 -> 保持端点, t=1 -> 变成中点
        const newLeft = this._lerp(left, mid, t);
        const newRight = this._lerp(right, mid, t);

        return { left: newLeft, right: newRight };
    }

    /**
     * 向量线性插值
     * @param {import("cs_script/point_script").Vector} a 
     * @param {import("cs_script/point_script").Vector} b 
     * @param {number} t 
     */
    _lerp(a, b, t) {
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t
        };
    }
    /* ===============================
       Funnel (String Pull)
    =============================== */

    /**
       * @param {{left:import("cs_script/point_script").Vector,right:import("cs_script/point_script").Vector}[]} portals
       */
    stringPull(portals) {
        const path = [];

        let apex = portals[0].left;
        let left = portals[0].left;
        let right = portals[0].right;

        let apexIndex = 0;
        let leftIndex = 0;
        let rightIndex = 0;

        path.push(apex);

        for (let i = 1; i < portals.length; i++) {
            const pLeft = portals[i].left;
            const pRight = portals[i].right;

            // 更新右边
            if (this.triArea2(apex, right, pRight) <= 0) {
                if (apex === right || this.triArea2(apex, left, pRight) > 0) {
                    right = pRight;
                    rightIndex = i;
                } else {
                    path.push(left);
                    apex = left;
                    apexIndex = leftIndex;
                    left = apex;
                    right = apex;
                    leftIndex = apexIndex;
                    rightIndex = apexIndex;
                    i = apexIndex;
                    continue;
                }
            }

            // 更新左边
            if (this.triArea2(apex, left, pLeft) >= 0) {
                if (apex === left || this.triArea2(apex, right, pLeft) < 0) {
                    left = pLeft;
                    leftIndex = i;
                } else {
                    path.push(right);
                    apex = right;
                    apexIndex = rightIndex;
                    left = apex;
                    right = apex;
                    leftIndex = apexIndex;
                    rightIndex = apexIndex;
                    i = apexIndex;
                    continue;
                }
            }
        }

        path.push(portals[portals.length - 1].left);
        return path;
    }
    /**
     * 返回值 > 0 表示 c 在 ab 线的左侧
     * 返回值 < 0 表示 c 在 ab 线的右侧
     * 返回值 = 0 表示三点共线
     * @param {{ x: number;y:number, z: number; }} a
     * @param {{ x: number;y:number, z: number; }} b
     * @param {{ x: number;y:number, z: number;}} c
     */
    triArea2(a, b, c) {
        return (b.x - a.x) * (c.y - a.y)
            - (b.y - a.y) * (c.x - a.x);
    }

}

class StaticData
{
    constructor()
    {
        this.Data = ""+`{"mesh":{"verts":[{"x":-763,"y":-3047,"z":236},{"x":-735,"y":-3033,"z":250},{"x":-763,"y":-2991,"z":236},{"x":-805,"y":-3677,"z":236},{"x":-735,"y":-3607,"z":236},{"x":-763,"y":-3593,"z":236},{"x":-875,"y":-4027,"z":295},{"x":-805,"y":-4027,"z":295},{"x":-1351,"y":-2977,"z":392},{"x":-1351,"y":-4503,"z":406},{"x":-875,"y":-4503,"z":406},{"x":-763,"y":-2291,"z":236},{"x":-735,"y":-2277,"z":236},{"x":-945,"y":-2053,"z":268},{"x":-217,"y":-3033,"z":588},{"x":-217,"y":-2851,"z":588},{"x":-763,"y":-2`
+`837,"z":236},{"x":-1351,"y":-2039,"z":392},{"x":-161,"y":-2277,"z":236},{"x":-147,"y":-2305,"z":253},{"x":-133,"y":-2305,"z":253},{"x":-77,"y":-2249,"z":236},{"x":-77,"y":-1381,"z":406},{"x":-1351,"y":-1381,"z":406},{"x":-105,"y":-3677,"z":236},{"x":-175,"y":-3607,"z":236},{"x":-91,"y":-4503,"z":406},{"x":-637,"y":-3061,"z":606},{"x":-651,"y":-2837,"z":606},{"x":-735,"y":-2823,"z":606},{"x":-735,"y":-3579,"z":606},{"x":63,"y":-3579,"z":606},{"x":49,"y":-3481,"z":606},{"x":-175,"y":-3467,"z":606}`
+`,{"x":-161,"y":-3075,"z":606},{"x":-203,"y":-3047,"z":606},{"x":-175,"y":-2403,"z":606},{"x":63,"y":-2389,"z":606},{"x":77,"y":-2305,"z":606},{"x":-735,"y":-2305,"z":606},{"x":-203,"y":-2823,"z":606},{"x":-161,"y":-2795,"z":606},{"x":77,"y":-3075,"z":606},{"x":105,"y":-3061,"z":606},{"x":105,"y":-3033,"z":596},{"x":-147,"y":-3089,"z":590},{"x":49,"y":-3089,"z":590},{"x":105,"y":-2851,"z":596},{"x":119,"y":-2823,"z":606},{"x":77,"y":-2795,"z":606},{"x":49,"y":-2795,"z":597},{"x":49,"y":-2305,"z":`
+`253},{"x":637,"y":-3033,"z":248},{"x":637,"y":-2851,"z":248},{"x":-147,"y":-3593,"z":236},{"x":63,"y":-3607,"z":236},{"x":763,"y":-3733,"z":236},{"x":637,"y":-3607,"z":236},{"x":777,"y":-4503,"z":406},{"x":63,"y":-2277,"z":236},{"x":651,"y":-2277,"z":236},{"x":665,"y":-2305,"z":236},{"x":805,"y":-2179,"z":248},{"x":791,"y":-1381,"z":406},{"x":77,"y":-3467,"z":606},{"x":637,"y":-3579,"z":606},{"x":637,"y":-2837,"z":606},{"x":553,"y":-2851,"z":606},{"x":539,"y":-3061,"z":606},{"x":539,"y":-2823,"z`
+`":606},{"x":637,"y":-2305,"z":606},{"x":665,"y":-3593,"z":236},{"x":665,"y":-3061,"z":236},{"x":1309,"y":-3047,"z":402},{"x":1309,"y":-4503,"z":406},{"x":665,"y":-2837,"z":236},{"x":1309,"y":-2179,"z":402},{"x":1309,"y":-1381,"z":406}],"polys":[[0,1,2],[3,4,5],[6,7,3],[0,2,8,9,6,3],[3,5,0],[9,10,6],[11,12,13],[2,1,14,15,16],[16,11,13,17,8,2],[18,19,20,21],[12,18,21,22,23,13],[23,17,13],[4,3,7],[7,6,10],[24,25,4,7,10,26],[27,28,29,30],[31,32,33,30],[33,34,35,27,30],[36,37,38,39],[40,41,36,39,29,2`
+`8],[42,43,44,34,45,46],[14,35,34,15],[47,48,49,50],[41,40,15],[41,15,34,44,47,50],[20,19,41,50,51],[47,44,52,53],[54,25,24],[45,54,24,55,46],[56,57,55,24,26,58],[21,20,51,59],[60,61,62],[21,59,60,62,63,22],[64,32,31,65],[66,67,68,65],[43,42,64,65,68],[69,67,66,70],[37,49,48,69,70,38],[71,57,56],[72,71,56,73],[56,58,74,73],[75,53,52,72],[76,62,61,75,72,73],[62,76,77,63]],"regions":[6,6,6,6,6,6,48,48,48,7,7,7,8,8,8,56,56,56,57,57,60,60,60,60,60,60,60,9,9,9,10,10,10,58,58,58,59,59,1,1,1,37,37,2],"n`
+`eighbors":[[-1,7,3],[12,-1,4],[13,12,3],[0,8,-1,5,2,4],[1,-1,3],[-1,13,3],[-1,10,8],[0,-1,21,-1,8],[-1,6,11,-1,3,7],[-1,25,30,10],[-1,9,32,-1,11,6],[-1,8,10],[1,2,14],[2,5,14],[27,-1,12,13,-1,29],[-1,19,-1,17],[33,-1,17,-1],[-1,21,-1,15,16],[-1,37,-1,19],[23,-1,18,-1,15,-1],[35,-1,24,-1,28,-1],[-1,17,24,7],[-1,37,-1,24],[19,-1,24],[23,21,20,26,22,25],[9,-1,24,-1,30],[24,-1,41,-1],[-1,14,28],[-1,27,29,-1,20],[38,-1,28,14,-1,40],[9,25,-1,32],[-1,42,32],[30,-1,31,43,-1,10],[-1,16,-1,35],[36,-1,35,-`
+`1],[20,-1,33,34,-1],[-1,34,-1,37],[-1,22,-1,36,-1,18],[-1,29,39],[-1,38,40,42],[29,-1,-1,39],[-1,26,-1,42],[43,31,-1,41,39,-1],[42,-1,-1,32]]},"meshdetail":{"verts":[{"x":-763,"y":-3047,"z":236},{"x":-735,"y":-3033,"z":241},{"x":-763,"y":-2991,"z":236},{"x":-805,"y":-3677,"z":236},{"x":-735,"y":-3607,"z":236},{"x":-763,"y":-3593,"z":236},{"x":-875,"y":-4027,"z":295},{"x":-805,"y":-4027,"z":292},{"x":-805,"y":-3793.67,"z":238},{"x":-805,"y":-3677,"z":236},{"x":-828.33,"y":-3793.67,"z":238},{"x":-`
+`763,"y":-3047,"z":236},{"x":-763,"y":-2991,"z":236},{"x":-841.4,"y":-2989.13,"z":237},{"x":-880.6,"y":-2988.2,"z":246},{"x":-1233.4,"y":-2979.8,"z":361},{"x":-1351,"y":-2977,"z":392},{"x":-1351,"y":-4420.51,"z":392},{"x":-1351,"y":-4503,"z":406},{"x":-875,"y":-4027,"z":295},{"x":-828.33,"y":-3793.67,"z":238},{"x":-805,"y":-3677,"z":236},{"x":-868,"y":-3054,"z":242},{"x":-868,"y":-3810,"z":242},{"x":-805,"y":-3677,"z":236},{"x":-763,"y":-3593,"z":236},{"x":-763,"y":-3047,"z":236},{"x":-1351,"y":-`
+`4503,"z":406},{"x":-875,"y":-4503,"z":406},{"x":-875,"y":-4027,"z":295},{"x":-763,"y":-2291,"z":236},{"x":-735,"y":-2277,"z":236},{"x":-840,"y":-2165,"z":236},{"x":-945,"y":-2053,"z":268},{"x":-854,"y":-2172,"z":237},{"x":-763,"y":-2991,"z":236},{"x":-749,"y":-3012,"z":236},{"x":-735,"y":-3033,"z":250},{"x":-575.62,"y":-3033,"z":341},{"x":-217,"y":-3033,"z":579},{"x":-217,"y":-2851,"z":579},{"x":-451,"y":-2845,"z":423},{"x":-490,"y":-2844,"z":405},{"x":-646,"y":-2840,"z":295},{"x":-724,"y":-2838`
+`,"z":250},{"x":-763,"y":-2837,"z":236},{"x":-532,"y":-2970,"z":378},{"x":-616,"y":-2928,"z":323},{"x":-364,"y":-2886,"z":488},{"x":-658,"y":-2844,"z":295},{"x":-532,"y":-3012,"z":378},{"x":-763,"y":-2837,"z":236},{"x":-763,"y":-2291,"z":236},{"x":-854,"y":-2172,"z":237},{"x":-945,"y":-2053,"z":268},{"x":-1351,"y":-2039,"z":392},{"x":-1351,"y":-2977,"z":392},{"x":-1233.4,"y":-2979.8,"z":361},{"x":-880.6,"y":-2988.2,"z":246},{"x":-841.4,"y":-2989.13,"z":237},{"x":-763,"y":-2991,"z":236},{"x":-868,`
+`"y":-2844,"z":242},{"x":-161,"y":-2277,"z":236},{"x":-147,"y":-2305,"z":243},{"x":-133,"y":-2305,"z":243},{"x":-77,"y":-2249,"z":236},{"x":-735,"y":-2277,"z":236},{"x":-161,"y":-2277,"z":236},{"x":-77,"y":-2249,"z":236},{"x":-77,"y":-2083.67,"z":239},{"x":-77,"y":-1381,"z":406},{"x":-1351,"y":-1381,"z":406},{"x":-1201.42,"y":-1628.58,"z":347},{"x":-945,"y":-2053,"z":268},{"x":-840,"y":-2165,"z":236},{"x":-826,"y":-2088,"z":239},{"x":-910,"y":-2046,"z":255},{"x":-1351,"y":-1381,"z":406},{"x":-135`
+`1,"y":-1463.25,"z":392},{"x":-1351,"y":-2039,"z":392},{"x":-945,"y":-2053,"z":268},{"x":-1201.42,"y":-1628.58,"z":347},{"x":-735,"y":-3607,"z":236},{"x":-805,"y":-3677,"z":236},{"x":-805,"y":-3793.67,"z":238},{"x":-805,"y":-4027,"z":295},{"x":-760.45,"y":-3759.73,"z":236},{"x":-805,"y":-4027,"z":295},{"x":-875,"y":-4027,"z":295},{"x":-875,"y":-4503,"z":406},{"x":-105,"y":-3677,"z":236},{"x":-175,"y":-3607,"z":236},{"x":-735,"y":-3607,"z":236},{"x":-760.45,"y":-3759.73,"z":236},{"x":-805,"y":-402`
+`7,"z":295},{"x":-875,"y":-4503,"z":406},{"x":-91,"y":-4503,"z":406},{"x":-102.9,"y":-3800.9,"z":242},{"x":-728,"y":-3810,"z":242},{"x":-637,"y":-3061,"z":606},{"x":-651,"y":-2837,"z":606},{"x":-735,"y":-2823,"z":606},{"x":-735,"y":-3579,"z":606},{"x":63,"y":-3579,"z":606},{"x":49,"y":-3481,"z":606},{"x":-175,"y":-3467,"z":606},{"x":-735,"y":-3579,"z":606},{"x":-175,"y":-3467,"z":606},{"x":-161,"y":-3075,"z":606},{"x":-203,"y":-3047,"z":606},{"x":-637,"y":-3061,"z":606},{"x":-735,"y":-3579,"z":60`
+`6},{"x":-175,"y":-2403,"z":606},{"x":63,"y":-2389,"z":606},{"x":77,"y":-2305,"z":606},{"x":-735,"y":-2305,"z":606},{"x":-203,"y":-2823,"z":606},{"x":-161,"y":-2795,"z":606},{"x":-175,"y":-2403,"z":606},{"x":-735,"y":-2305,"z":606},{"x":-735,"y":-2823,"z":606},{"x":-651,"y":-2837,"z":606},{"x":77,"y":-3075,"z":606},{"x":105,"y":-3061,"z":606},{"x":105,"y":-3033,"z":596},{"x":67,"y":-3039,"z":607},{"x":-9,"y":-3051,"z":607},{"x":-123,"y":-3069,"z":590},{"x":-161,"y":-3075,"z":600},{"x":-147,"y":-3`
+`089,"z":590},{"x":49,"y":-3089,"z":590},{"x":-98,"y":-3068,"z":600},{"x":-217,"y":-3033,"z":588},{"x":-203,"y":-3047,"z":597},{"x":-182,"y":-3061,"z":607},{"x":-161,"y":-3075,"z":600},{"x":-179.67,"y":-3000.33,"z":606},{"x":-198.33,"y":-2925.67,"z":588},{"x":-217,"y":-2851,"z":588},{"x":105,"y":-2851,"z":596},{"x":119,"y":-2823,"z":606},{"x":77,"y":-2795,"z":606},{"x":49,"y":-2795,"z":597},{"x":77,"y":-2823,"z":607},{"x":-161,"y":-2795,"z":597},{"x":-203,"y":-2823,"z":606},{"x":-217,"y":-2851,"z`
+`":588},{"x":-189,"y":-2823,"z":606},{"x":-161,"y":-2795,"z":597},{"x":-189,"y":-2823,"z":606},{"x":-217,"y":-2851,"z":588},{"x":-198.33,"y":-2925.67,"z":588},{"x":-179.67,"y":-3000.33,"z":606},{"x":-161,"y":-3075,"z":600},{"x":-123,"y":-3069,"z":590},{"x":-9,"y":-3051,"z":607},{"x":67,"y":-3039,"z":607},{"x":105,"y":-3033,"z":596},{"x":105,"y":-2851,"z":596},{"x":77,"y":-2823,"z":607},{"x":49,"y":-2795,"z":597},{"x":-154,"y":-2970,"z":607},{"x":-112,"y":-3054,"z":607},{"x":-133,"y":-2305,"z":253`
+`},{"x":-147,"y":-2305,"z":253},{"x":-161,"y":-2795,"z":597},{"x":49,"y":-2795,"z":597},{"x":49,"y":-2305,"z":253},{"x":-14,"y":-2354,"z":282},{"x":105,"y":-2851,"z":596},{"x":105,"y":-3033,"z":596},{"x":637,"y":-3033,"z":248},{"x":637,"y":-2851,"z":248},{"x":-147,"y":-3593,"z":236},{"x":-175,"y":-3607,"z":236},{"x":-105,"y":-3677,"z":236},{"x":-147,"y":-3089,"z":580},{"x":-147,"y":-3166.54,"z":521},{"x":-147,"y":-3205.31,"z":502},{"x":-147,"y":-3321.62,"z":413},{"x":-147,"y":-3360.38,"z":393},{"`
+`x":-147,"y":-3476.69,"z":305},{"x":-147,"y":-3593,"z":236},{"x":-105,"y":-3677,"z":236},{"x":63,"y":-3607,"z":236},{"x":61.92,"y":-3567.15,"z":246},{"x":59.77,"y":-3487.46,"z":305},{"x":58.69,"y":-3447.62,"z":325},{"x":53.31,"y":-3248.38,"z":472},{"x":52.23,"y":-3208.54,"z":492},{"x":49,"y":-3089,"z":580},{"x":-84,"y":-3572,"z":246},{"x":-126,"y":-3152,"z":541},{"x":-126,"y":-3320,"z":423},{"x":0,"y":-3194,"z":511},{"x":-84,"y":-3614,"z":236},{"x":763,"y":-3733,"z":236},{"x":637,"y":-3607,"z":23`
+`6},{"x":63,"y":-3607,"z":236},{"x":-105,"y":-3677,"z":236},{"x":-102.9,"y":-3800.9,"z":242},{"x":-91,"y":-4503,"z":406},{"x":777,"y":-4503,"z":406},{"x":763.74,"y":-3773.53,"z":236},{"x":-77,"y":-2249,"z":236},{"x":-133,"y":-2305,"z":243},{"x":49,"y":-2305,"z":243},{"x":63,"y":-2277,"z":236},{"x":651,"y":-2277,"z":236},{"x":665,"y":-2305,"z":236},{"x":777,"y":-2204.2,"z":236},{"x":805,"y":-2179,"z":244},{"x":774.2,"y":-2198.6,"z":236},{"x":-77,"y":-2249,"z":236},{"x":63,"y":-2277,"z":236},{"x":6`
+`51,"y":-2277,"z":236},{"x":774.2,"y":-2198.6,"z":236},{"x":805,"y":-2179,"z":244},{"x":802.2,"y":-2019.4,"z":252},{"x":791,"y":-1381,"z":406},{"x":-77,"y":-1381,"z":406},{"x":-77,"y":-2083.67,"z":239},{"x":532,"y":-2088,"z":239},{"x":77,"y":-3467,"z":606},{"x":49,"y":-3481,"z":606},{"x":63,"y":-3579,"z":606},{"x":637,"y":-3579,"z":606},{"x":637,"y":-2837,"z":606},{"x":553,"y":-2851,"z":606},{"x":539,"y":-3061,"z":606},{"x":637,"y":-3579,"z":606},{"x":105,"y":-3061,"z":606},{"x":77,"y":-3075,"z":`
+`606},{"x":77,"y":-3467,"z":606},{"x":637,"y":-3579,"z":606},{"x":539,"y":-3061,"z":606},{"x":539,"y":-2823,"z":606},{"x":553,"y":-2851,"z":606},{"x":637,"y":-2837,"z":606},{"x":637,"y":-2305,"z":606},{"x":63,"y":-2389,"z":606},{"x":77,"y":-2795,"z":606},{"x":119,"y":-2823,"z":606},{"x":539,"y":-2823,"z":606},{"x":637,"y":-2305,"z":606},{"x":77,"y":-2305,"z":606},{"x":665,"y":-3593,"z":236},{"x":637,"y":-3607,"z":236},{"x":763,"y":-3733,"z":236},{"x":665,"y":-3061,"z":236},{"x":665,"y":-3593,"z":`
+`236},{"x":763,"y":-3733,"z":236},{"x":867,"y":-3602.33,"z":261},{"x":1309,"y":-3047,"z":402},{"x":785.75,"y":-3058.37,"z":239},{"x":770,"y":-3586,"z":236},{"x":763,"y":-3733,"z":236},{"x":763.74,"y":-3773.53,"z":236},{"x":777,"y":-4503,"z":406},{"x":1309,"y":-4503,"z":406},{"x":1309,"y":-3047,"z":402},{"x":867,"y":-3602.33,"z":261},{"x":665,"y":-2837,"z":236},{"x":637,"y":-2851,"z":239},{"x":637,"y":-3033,"z":239},{"x":665,"y":-3061,"z":236},{"x":1309,"y":-2179,"z":402},{"x":805,"y":-2179,"z":24`
+`4},{"x":777,"y":-2204.2,"z":236},{"x":665,"y":-2305,"z":236},{"x":665,"y":-2837,"z":236},{"x":665,"y":-3061,"z":236},{"x":785.75,"y":-3058.37,"z":239},{"x":1309,"y":-3047,"z":402},{"x":770,"y":-2830,"z":236},{"x":805,"y":-2179,"z":248},{"x":1309,"y":-2179,"z":402},{"x":1309,"y":-1381,"z":406},{"x":791,"y":-1381,"z":406},{"x":802.2,"y":-2019.4,"z":252},{"x":854,"y":-2032,"z":261},{"x":854,"y":-1990,"z":262}],"tris":[[0,1,2],[3,4,5],[8,9,10],[7,8,10],[6,7,10],[11,12,13],[17,18,19],[11,21,22],[15,1`
+`4,22],[11,13,22],[14,13,22],[16,17,23],[17,19,23],[20,19,23],[20,21,23],[22,21,23],[16,15,23],[22,15,23],[24,25,26],[27,28,29],[32,33,34],[32,34,30],[30,31,32],[44,45,35],[41,42,46],[36,35,47],[44,35,47],[36,37,47],[38,37,47],[38,46,47],[43,42,47],[46,42,47],[39,40,48],[40,41,48],[41,46,48],[43,44,49],[44,47,49],[47,43,49],[38,39,50],[46,38,50],[39,48,50],[46,48,50],[53,54,55],[51,52,61],[56,57,61],[58,57,61],[51,60,61],[58,59,61],[60,59,61],[56,55,61],[52,53,61],[55,53,61],[62,63,64],[62,64,65]`
+`,[67,68,69],[70,71,75],[71,72,75],[70,69,75],[69,67,75],[74,66,75],[67,66,75],[72,73,76],[75,72,76],[73,74,76],[75,74,76],[81,77,78],[81,78,79],[79,80,81],[86,82,83],[86,83,84],[84,85,86],[87,88,89],[97,90,91],[95,96,98],[95,94,98],[92,93,98],[94,93,98],[96,97,98],[92,91,98],[97,91,98],[99,100,101],[99,101,102],[103,104,105],[103,105,106],[107,108,109],[107,109,110],[107,110,111],[112,113,114],[112,114,115],[116,117,118],[120,121,116],[120,116,118],[118,119,120],[127,128,129],[122,123,124],[122,`
+`124,125],[130,122,125],[130,125,126],[126,127,131],[127,129,131],[129,130,131],[126,130,131],[132,133,134],[132,134,135],[132,135,136],[132,136,137],[132,137,138],[141,142,143],[143,139,140],[140,141,143],[145,146,147],[144,145,147],[149,150,151],[156,157,158],[156,158,159],[155,156,159],[151,152,161],[155,159,161],[148,160,161],[159,160,161],[151,149,161],[148,149,161],[154,155,162],[155,161,162],[161,152,162],[154,153,162],[152,153,162],[166,167,168],[167,163,168],[166,165,168],[163,164,168],[`
+`165,164,168],[172,169,170],[170,171,172],[173,174,175],[186,180,191],[180,181,191],[181,182,191],[186,185,191],[185,184,191],[190,176,192],[176,177,192],[177,178,192],[179,180,193],[179,178,193],[180,186,193],[188,187,193],[186,187,193],[192,178,194],[189,188,194],[178,193,194],[188,193,194],[189,190,194],[192,190,194],[183,184,195],[184,191,195],[191,182,195],[183,182,195],[203,196,197],[198,199,200],[203,197,198],[203,198,200],[203,200,201],[201,202,203],[206,207,204],[204,205,206],[210,211,21`
+`2],[210,212,208],[208,209,210],[216,217,218],[221,213,214],[219,220,222],[219,218,222],[215,216,222],[218,216,222],[220,221,222],[215,214,222],[221,214,222],[223,224,225],[223,225,226],[227,228,229],[227,229,230],[231,232,233],[235,231,233],[233,234,235],[236,237,238],[236,238,239],[240,241,242],[245,240,242],[245,242,243],[243,244,245],[246,247,248],[252,253,254],[252,254,255],[254,249,255],[250,249,255],[250,251,255],[252,251,255],[261,256,257],[260,261,257],[257,258,259],[257,259,260],[262,26`
+`3,264],[262,264,265],[270,271,272],[273,266,274],[270,269,274],[266,267,274],[269,268,274],[267,268,274],[270,272,274],[273,272,274],[279,275,280],[276,275,280],[277,278,281],[278,279,281],[280,279,281],[280,276,281],[277,276,281]],"meshes":[[0,3,0,1],[3,3,1,1],[6,5,2,3],[11,13,5,13],[24,3,18,1],[27,3,19,1],[30,5,20,3],[35,16,23,19],[51,11,42,10],[62,4,52,2],[66,11,54,11],[77,5,65,3],[82,5,68,3],[87,3,71,1],[90,9,72,8],[99,4,80,2],[103,4,82,2],[107,5,84,3],[112,4,87,2],[116,6,89,4],[122,10,93,9]`
+`,[132,7,102,5],[139,5,107,3],[144,4,110,2],[148,15,112,15],[163,6,127,5],[169,4,132,2],[173,3,134,1],[176,20,135,23],[196,8,158,6],[204,4,164,2],[208,5,166,3],[213,10,169,9],[223,4,178,2],[227,4,180,2],[231,5,182,3],[236,4,185,2],[240,6,187,4],[246,3,191,1],[249,7,192,6],[256,6,198,4],[262,4,202,2],[266,9,204,8],[275,7,212,7]],"triTopoly":[0,1,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,4,5,6,6,6,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,8,8,8,8,8,8,8,8,8,8,9,9,10,10,10,10,10,10,10,10,10,10,10,11,11,11,12,12,12`
+`,13,14,14,14,14,14,14,14,14,15,15,16,16,17,17,17,18,18,19,19,19,19,20,20,20,20,20,20,20,20,20,21,21,21,21,21,22,22,22,23,23,24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,25,25,25,25,25,26,26,27,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,29,29,29,29,29,29,30,30,31,31,31,32,32,32,32,32,32,32,32,32,33,33,34,34,35,35,35,36,36,37,37,37,37,38,39,39,39,39,39,39,40,40,40,40,41,41,42,42,42,42,42,42,42,42,43,43,43,43,43,43,43]},"links":[{"PolyA":4,"PolyB":7,"PosA":{"x":-763,"y":-3`
+`047,"z":236},"PosB":{"x":-735,"y":-3033,"z":250},"cost":null,"type":1},{"PolyA":7,"PolyB":17,"PosA":{"x":-217,"y":-3033,"z":588},"PosB":{"x":-216.53430353430355,"y":-3047.4365904365904,"z":606},"cost":null,"type":1},{"PolyA":10,"PolyB":25,"PosA":{"x":-161,"y":-2277,"z":236},"PosB":{"x":-147,"y":-2305,"z":253},"cost":null,"type":1},{"PolyA":20,"PolyB":28,"PosA":{"x":105,"y":-3061,"z":606},"PosB":{"x":49,"y":-3089,"z":590},"cost":null,"type":1}]}`;
    }
}

class NavMesh {
    constructor() {
        /**@type {OpenHeightfield} */
        this.hf;
        /**@type {RegionGenerator} */
        this.regionGen;
        /**@type {ContourBuilder} */
        this.contourBuilder;
        /**@type {PolyMeshBuilder} */
        this.polyMeshGenerator;
        /**@type {PolyMeshDetailBuilder} */
        this.polidetail;
        /**@type {JumpLinkBuilder} */
        this.jumplinkbuilder;
        /**@type {PolyGraphAStar} */
        this.astar;
        /**@type {{verts: {x: number;y: number;z: number;}[];polys: number[][];regions: number[];neighbors: number[][];}} */
        this.mesh;
        /**@type {{verts: {x: number;y: number;z: number;}[];tris:number[][];triTopoly:number[];meshes: number[][];}} */
        this.meshdetail;
        /**@type {FunnelPath} */
        this.funnel;
        /**@type {FunnelHeightFixer} */
        this.heightfixer;
        /**@type {{ PolyA: number; PolyB: number; PosA: { x: number; y: number; z: number; }; PosB: { x: number; y: number; z: number; }; cost: number;type: number; }[]} */
        this.links;
        /** @type {number[]}*/
        this._polyAreas = [];
        /**@type {number[]}*/
        this._polyPrefix = [];
        /**@type {number}*/
        this._totalPolyArea;
    }
    /**
     * @param {number} [duration]
     */
    debug(duration = 5) {
    }
    debugLoad(duration = 5) {
        for (let pi = 0; pi < this.mesh.polys.length; pi++) {
            const poly = this.mesh.polys[pi];
            const color = {r:255,g:0,b:0};
            for (let i = 0; i < poly.length; i++) {
                const start = this.mesh.verts[poly[i]];
                const end = this.mesh.verts[poly[(i + 1) % poly.length]];
                Instance.DebugLine({ start, end, color, duration });
            }
        }
        for (const link of this.links) {
            Instance.DebugLine({
                start: link.PosA,
                end: link.PosB,
                color: { r: 0, g: (link.type==1?255:0), b: 255 },
                duration
            });
            Instance.DebugSphere({ center: link.PosA, radius: 4, color: { r: 0, g: 255, b: 0 }, duration });
            //Instance.DebugSphere({ center: link.endPos, radius: 4, color: { r: 255, g: 0, b: 0 }, duration });
            const poly = this.mesh.polys[link.PolyB];
            for (let i = 0; i < poly.length; i++) {
                const start = this.mesh.verts[poly[i]];
                const end = this.mesh.verts[poly[(i + 1) % poly.length]];
                Instance.DebugLine({start,end,color:{ r: 255, g: 0, b: 255 },duration});
                //Instance.DebugSphere({center:start,radius:6,color,duration});
            }
        }
    }
    /**
     * 导出导航网格数据为文本字符串
     */
    exportNavData() {
        const charsPerLine = 500;
        if (!this.mesh) {
            Instance.Msg("错误：没有可导出的数据！请先生成网格。");
        }
        this.mesh.verts = this.mesh.verts.map(v => ({
            x: Math.round(v.x * 100) / 100,
            y: Math.round(v.y * 100) / 100,
            z: Math.round(v.z * 100) / 100
        }));
        this.meshdetail.verts=this.meshdetail.verts.map(v => ({
            x: Math.round(v.x * 100) / 100,
            y: Math.round(v.y * 100) / 100,
            z: Math.round(v.z * 100) / 100
        }));
        const data = {
            mesh: this.mesh,           // 包含 verts, polys, regions, neighbors
            meshdetail: this.meshdetail,
            links: this.jumplinkbuilder ? this.jumplinkbuilder.links : [],
        };

        // 使用 JSON 序列化
        const jsonStr = JSON.stringify(data);
        // 2. 将字符串切割成指定长度的块
        Instance.Msg("--- NAV DATA START ---");
        for (let i = 0; i < jsonStr.length; i += charsPerLine) {
            Instance.Msg("+`"+jsonStr.substring(i, i + charsPerLine)+"`");
        }
        Instance.Msg("--- NAV DATA END ---");
    }
    /**
     * 从文本字符串恢复导航网格
     * @param {string} jsonStr 
     */
    importNavData(jsonStr) {
        try {
            const cleanJson = jsonStr.replace(/\s/g, "");
            const data = JSON.parse(cleanJson);

            // 1. 恢复核心网格数据
            this.mesh = data.mesh;
            this.links=data.links;
            this.meshdetail=data.meshdetail;
            Instance.Msg(`导航数据加载成功！多边形数量: ${this.mesh.polys.length}`);
            return true;
        } catch (e) {
            Instance.Msg(`加载导航数据失败: ${e}`);
            return false;
        }
    }
    init() {
        this.importNavData(new StaticData().Data);

        //构建A*寻路
        this.heightfixer=new FunnelHeightFixer(this.mesh,this.meshdetail,ADJUST_HEIGHT_DISTANCE);
        this.astar = new PolyGraphAStar(this.mesh,this.links,this.heightfixer);
        this.funnel = new FunnelPath(this.mesh, this.astar.centers,this.links);
    }
    /**
     * 输入起点终点，返回世界坐标路径点
     * @param {{x:number,y:number,z:number}} start
     * @param {{x:number,y:number,z:number}} end
     * @returns {{pos:{x:number,y:number,z:number},mode:number}[]}
     */
    findPath(start, end) {
        //Instance.DebugLine({start,end,duration:1,color:{r:0,g:255,b:0}});
        //Instance.Msg(`start:     x:${start.x},y:${start.y},z:${start.z}     end:     x:${end.x},y:${end.y},z:${end.z}`);
        //Instance.Msg("\n\n");
        const polyPath=this.astar.findPath(start,end);
        //Instance.Msg("astar:"+polyPath.path.length);
        //this.debugDrawPolyPath(polyPath.path, 1);
        if (!polyPath || polyPath.path.length === 0) return [];
        const funnelPath = this.funnel.build(polyPath.path, polyPath.start, polyPath.end);
        //Instance.Msg("funnel:"+funnelPath.length);
        //this.debugDrawfunnelPath(funnelPath,1/1);
        const ans=this.heightfixer.fixHeight(funnelPath,polyPath.path);
        //Instance.DebugSphere({center:polyPath.start,radius:1,duration:1});
        //Instance.DebugSphere({center:polyPath.end,radius:1,duration:1});
        //Instance.Msg("heightfixer:"+ans.length);
        if (!ans || ans.length === 0) return [];
        this.debugDrawPath(ans,1/32);

        //多边形总数：1025跳点数：162
        //100次A*           68ms
        //100次funnelPath   74ms-68=6ms
        //100次fixHeight    82ms-74=8ms
        return ans;
    }
    /**
     * @param {{pos:{x:number,y:number,z:number},mode:number}[]} path
     */
    debugDrawfunnelPath(path, duration = 10) {
        if (!path || path.length < 2) {
            Instance.Msg("No path to draw");
            return;
        }
        const color = {
            r: Math.floor(0),
            g: Math.floor(255),
            b: Math.floor(0),
        };
        const colorJ = {
            r: Math.floor(0),
            g: Math.floor(255),
            b: Math.floor(255),
        };

        const last = path[0].pos;
        Instance.DebugSphere({
            center: { x: last.x, y: last.y, z: last.z },
            radius: 3,
            color: { r: 255, g: 0, b: 0 },
            duration
        });
        for (let i = 1; i < path.length; i++) {
            const a = path[i-1].pos;
            const b = path[i].pos;

            Instance.DebugLine({
                start: { x: a.x, y: a.y, z: a.z },
                end: { x: b.x, y: b.y, z: b.z },
                color:path[i].mode==2?colorJ:color,
                duration
            });

            Instance.DebugSphere({
                center: { x: b.x, y: b.y, z: b.z },
                radius: 3,
                color:path[i].mode==2?colorJ:color,
                duration
            });
        }
    }
    /**
     * @param {{pos:{x:number,y:number,z:number},mode:number}[]} path
     */
    debugDrawPath(path, duration = 10) {
        const color = {
            r: Math.floor(0),
            g: Math.floor(0),
            b: Math.floor(255),
        };
        const colorJ = {
            r: Math.floor(255),
            g: Math.floor(255),
            b: Math.floor(0),
        };
        if (!path||path.length==2) {
            if(path.length==2)
            {
                Instance.DebugSphere({
                    center: { x: path[0].pos.x, y: path[0].pos.y, z: path[0].pos.z },
                    radius: 3,
                    color: { r: 0, g: 0, b: 255 },
                    duration
                });
                Instance.DebugLine({
                    start: { x: path[0].pos.x, y: path[0].pos.y, z: path[0].pos.z },
                    end: { x: path[1].pos.x, y: path[1].pos.y, z: path[1].pos.z },
                    color:path[1].mode==2?colorJ:color,
                    duration
                });

                Instance.DebugSphere({
                    center: { x: path[1].pos.x, y: path[1].pos.y, z: path[1].pos.z },
                    radius: 3,
                    color:path[1].mode==2?colorJ:color,
                    duration
                });
            }
            else Instance.Msg("No path to draw");
            return;
        }

        const last = path[0].pos;
        Instance.DebugSphere({
            center: { x: last.x, y: last.y, z: last.z },
            radius: 3,
            color: { r: 0, g: 0, b: 255 },
            duration
        });
        for (let i = 1; i < path.length; i++) {
            const a = path[i-1].pos;
            const b = path[i].pos;

            Instance.DebugLine({
                start: { x: a.x, y: a.y, z: a.z },
                end: { x: b.x, y: b.y, z: b.z },
                color:path[i].mode==2?colorJ:color,
                duration
            });

            Instance.DebugSphere({
                center: { x: b.x, y: b.y, z: b.z },
                radius: 3,
                color:path[i].mode==2?colorJ:color,
                duration
            });
        }
    }
    /**
     * @param {{id:number,mode:number}[]} polyPath
     */
    debugDrawPolyPath(polyPath, duration = 10) {
        if (!polyPath || polyPath.length === 0) return;

        let prev = null;
        const color = {
            r: Math.floor(100 + Math.random() * 155),
            g: Math.floor(100 + Math.random() * 155),
            b: Math.floor(100 + Math.random() * 155),
        };
        const colorJ = {
            r: Math.floor(100 + Math.random() * 155),
            g: Math.floor(100 + Math.random() * 155),
            b: Math.floor(100 + Math.random() * 155),
        };
        for (const pi of polyPath) {
            Instance.Msg(pi.id);
            const poly = this.mesh.polys[pi.id];

            // poly 中心
            let cx = 0, cy = 0, cz = 0;
            for (const vi of poly) {
                const v = this.mesh.verts[vi];
                cx += v.x; cy += v.y; cz += v.z;
            }
            cx /= poly.length;
            cy /= poly.length;
            cz /= poly.length;

            const center = { x: cx, y: cy, z: cz };
            if(pi.mode==2)
            {
                Instance.DebugSphere({
                    center,
                    radius: 10,
                    color:colorJ,
                    duration
                });

                if (prev) {
                    Instance.DebugLine({
                        start: prev,
                        end: center,
                        color:colorJ,
                        duration
                    });
                }
            }
            else
            {
                Instance.DebugSphere({
                    center,
                    radius: 10,
                    color,
                    duration
                });

                if (prev) {
                    Instance.DebugLine({
                        start: prev,
                        end: center,
                        color,
                        duration
                    });
                }
                }
            prev = center;
        }
    }

    testinit() {
        const polys = this.mesh.polys;
        const verts = this.mesh.verts;

        this._polyAreas = [];
        this._polyPrefix = [];

        let total = 0;

        for (let i = 0; i < polys.length; i++) {
            const poly = polys[i];
            let area = 0;

            for (let j = 0; j < poly.length; j++) {
                const a = verts[poly[j]];
                const b = verts[poly[(j + 1) % poly.length]];
                area += (a.x * b.y - b.x * a.y);
            }

            area = Math.abs(area) * 0.5;
            this._polyAreas.push(area);

            total += area;
            this._polyPrefix.push(total);
        }

        this._totalPolyArea = total;
    }
    _randomPoint() {
        // 1. 按面积随机选 poly
        const r = Math.random() * this._totalPolyArea;
        let lo = 0, hi = this._polyPrefix.length - 1;

        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (r <= this._polyPrefix[mid]) hi = mid;
            else lo = mid + 1;
        }

        const pi = lo;
        const poly = this.mesh.polys[pi];
        const verts = this.mesh.verts;

        // 2. 扇形三角化采样
        const v0 = verts[poly[0]];
        let total = 0;
        const tris = [];

        for (let i = 1; i < poly.length - 1; i++) {
            const v1 = verts[poly[i]];
            const v2 = verts[poly[i + 1]];

            const area = Math.abs(
                (v1.x - v0.x) * (v2.y - v0.y) -
                (v1.y - v0.y) * (v2.x - v0.x)
            ) * 0.5;

            tris.push({ v0, v1, v2, area });
            total += area;
        }

        let t = Math.random() * total;
        for (const tri of tris) {
            if (t <= tri.area) {
                return this._randomPointInTri(tri.v0, tri.v1, tri.v2);
            }
            t -= tri.area;
        }

        return null;
    }
    /**
     * @param {{ x: number; y: number; z: number; }} a
     * @param {{ x: number; y: number; z: number; }} b
     * @param {{ x: number; y: number; z: number; }} c
     */
    _randomPointInTri(a, b, c) {
        let r1 = Math.random();
        let r2 = Math.random();

        if (r1 + r2 > 1) {
            r1 = 1 - r1;
            r2 = 1 - r2;
        }

        return {
            x: a.x + r1 * (b.x - a.x) + r2 * (c.x - a.x),
            y: a.y + r1 * (b.y - a.y) + r2 * (c.y - a.y),
            z: a.z + r1 * (b.z - a.z) + r2 * (c.z - a.z)
        };
    }
    /**
     * NavMesh 压力测试
     * @param {number} count  随机寻路次数
     */
    randomTest(count = 1000) {
        for (let i = 0; i < count; i++) {
            const start = this._randomPoint();
            const end = this._randomPoint();

            if (!start || !end) {
                continue;
            }

            const path = this.findPath(start, end);
            //this.debugDrawPolyPath(path,30);
            if (path && path.length > 0) ;
        }
    }

}

/*
事件大全

//当受到伤害后(伤害值，最后血量)
OntakeDamage(value,health)

//怪物死亡前，这时候实体还未销毁
OnDie()

//当前TICK(tick间隔，所有怪物breakable实体)
OnTick(dt,allmpos)

//目标更新后
OnupdateTarget()

//没有攻击到目标
OnattackFalse()

//对目标造成伤害后
OnattackTrue()
 */
class SkillTemplate
{
    /**
     * @param {Monster} monster
     */
    constructor(monster) {
        this.monster=monster;
        this.id = "unknown";
        this.type="null";
        // 冷却（秒）
        this.cooldown = 0;
        this.lastTriggerTime = -999;
        this.running=false;
    }
    /**
     * 能力被添加到怪物时调用
     */
    onAdd() {}

    /**
     * 这个事件能否执行，有些被动技能在这里直接执行，然后返回false，例如护盾，一类的需要实时的
     * @param {any} event
     */
    canTrigger(event) {
        return false;
    }
    /**
     * 请求执行
     */
    request(){}
    /**
     * 执行skill
     */
    trigger() {}
    //对于后台限时技能的执行
    /**
     */
    tick(){}
    _cooldownReady() {
        if (this.cooldown <= 0) return true;
        const now = Instance.GetGameTime();
        return now - this.lastTriggerTime >= this.cooldown;
    }

    _markTriggered() {
        this.lastTriggerTime = Instance.GetGameTime();
    }
}

class CoreStats extends SkillTemplate {
    /**
     * @param {Monster} monster 
     * @param {{ 
     * health_mult: number,health_value:number; 
     * damage_mult: number,damage_value:number; 
     * speed_mult: number,speed_value:number;  
     * reward_mult: number,reward_value:number; 
     * }} params
     */
    constructor(monster,params) {
        super(monster);
        this.id = "CoreStats";
        this.type="Passive";
        this.params = params;
    }

    onAdd() {
        if(this.params.health_value)this.monster.health=this.monster.maxhealth +=this.params.health_value;
        if(this.params.health_mult)this.monster.health=this.monster.maxhealth *=this.params.health_mult;
        if(this.monster.maxhealth<=0)this.monster.health=this.monster.maxhealth=1;

        if(this.params.damage_value)this.monster.damage+=this.params.damage_value;
        if(this.params.damage_mult)this.monster.damage*=this.params.damage_mult;
        if(this.monster.damage<0)this.monster.damage=0;

        if(this.params.speed_value)this.monster.speed+=this.params.speed_value;
        if(this.params.speed_mult)this.monster.speed*=this.params.speed_mult;
        if(this.monster.speed<0)this.monster.speed=0;

        if(this.params.reward_value)this.monster.baseReward+=this.params.reward_value;
        if(this.params.reward_mult)this.monster.baseReward*=this.params.reward_mult;
        if(this.monster.baseReward<0)this.monster.baseReward=0;
    }
}

class PounceSkill extends SkillTemplate {
    /**
     * @param {Monster} monster 
     * @param {{cooldowntime:number,distance:number,animation:string}} params
     */
    constructor(monster,params) {
        super(monster);
        this.id = "Pounce";
        this.type="Active";
        this.cooldown = params.cooldowntime;
        this.distance=params.distance;
        this.anim=params.animation;
    }
    /**
     * @param {any} event
     */
    canTrigger(event) {
        if(event.type!="OnTick")return false;
        if (!this.monster.target) return false;
        if (this.monster.isOccupied()) return false;
        if (!this._cooldownReady()) return false;
        const dist = this.monster.distanceTo(this.monster.target);
        this.dt=event.dt;
        this.allmpos=event.allmpos;
        return dist > this.monster.attackdist && dist < this.distance;
    }
    tick() {
        if (!this.running) return;
        if(this.monster.movelocomotion.controller.currentName!="pounce")
        {
            this.running=false;
            this.monster.movelocomotion.pathFollower.clear();
        }
        this.monster.movelocomotion.resume();
        this.monster.movelocomotion.update(this.dt,this.allmpos);
        return;
    }
    request()
    {
        this.monster.requestSkill(this.id);
    }
    trigger() 
    {
        if(!this.monster.target)return;
        this.running = true;
        const targetPos = this.monster.target.GetAbsOrigin();
        this.monster.movelocomotion.controller.setMode("pounce",targetPos);
        this.monster.animator.play(this.anim);
        this._markTriggered();
    }
}

class DoubleAttackSkill extends SkillTemplate {
    /**
     * @param {Monster} monster 
     */
    constructor(monster) {
        super(monster);
        this.id = "DoubleAttack";
        this.type="Passive";
    }
    /**
     * @param {any} event
     */
    canTrigger(event) {
        if(event.type!="OnattackTrue")return false;
        if (!this.monster.target) return false;
        if (this.monster.isOccupied()) return false;
        if (!this._cooldownReady()) return false;
        //这里给与玩家伤害
        return false;
    }
}

class PowerAttackSkill extends SkillTemplate {
    /**
     * @param {Monster} monster 
     */
    constructor(monster) {
        super(monster);
        this.id = "PowerAttack";
        this.type="Passive";
    }
    /**
     * @param {any} event
     */
    canTrigger(event) {
        if(event.type!="OnattackTrue")return false;
        if (!this.monster.target) return false;
        if (this.monster.isOccupied()) return false;
        if (!this._cooldownReady()) return false;
        //这里给与玩家速度
        return false;
    }
}

class PoisonGasSkill extends SkillTemplate {
    /**
     * @param {Monster} monster 
     */
    constructor(monster) {
        super(monster);
        this.id = "PoisonGas";
        this.type="Passive";
    }

    /**
     * @param {any} event
     */
    canTrigger(event) {
        if(event.type!="OnDie")return false;
        if (!this.monster.target) return false;
        if (this.monster.isOccupied()) return false;
        if (!this._cooldownReady()) return false;
        //这里在当前位置放一个粒子特效，并给与进入玩家持续伤害
        return false;
    }
}

class ShieldSkill extends SkillTemplate {
    /**
     * @param {Monster} monster 
     * @param {{cooldowntime:number,runtime:number,value:number}} params
     */
    constructor(monster,params) {
        super(monster);
        this.id = "Shield";
        this.type="Active";
        this.cooldowntime=params.cooldowntime;
        this.runtime=params.runtime;
        this.maxshield=params.value;
        this.shield=0;
    }
    /**
     * @param {any} event
     */
    canTrigger(event) {
        if(this.running)
        {
            if(event.type=="OntakeDamage")
            {
                this.shield-=event.value;
                this.monster.health+=event.value;
                this.monster.breakable.SetHealth(10000-(this.monster.maxhealth-this.monster.health));
                if(this.shield<=0)
                {
                    this.running=false;
                    if(this.monster.model instanceof BaseModelEntity)
                    {
                        this.monster.model.Unglow();
                    }
                    //护盾最后一点护盾值也能抵消这次伤害
                }
            }
            return false;
        }
        if (this.monster.isOccupied()) return false;
        if (!this._cooldownReady()) return false;
        return true;
    }
    tick()
    {
        if (!this.running) return;
        if (this.runtime!=-1&&this.lastTriggerTime+this.runtime<=Instance.GetGameTime())
        {
            this.running=false;
            if(this.monster.model instanceof BaseModelEntity)
            {
                this.monster.model.Unglow();
            }
            return;
        }
    }
    request()
    {
        this.monster.requestSkill(this.id);
    }
    trigger() 
    {
        this.shield=this.maxshield;
        if(this.monster.model instanceof BaseModelEntity)
        {
            this.monster.model.Glow({r:0,g:0,b:255});
        }
        this.running=true;
        this._markTriggered();
    }
}

/*
技能大全

被动技能 基础属性增加
p_CoreStats({health_mult: number,health_value:number,     //生命值倍率，生命值增加或减少
             damage_mult: number,damage_value:number,     //攻击倍率，攻击增加或减少
             speed_mult: number,speed_value:number,       //速度倍率，速度增加或减少
             reward_mult: number,reward_value:number} )   //奖励倍率，奖励增加或减少

主动技能 飞扑(冷却时间，触发距离，播放动作)
a_pounce(cooldowntime:number,distance:number,animation:string)

被动技能 双倍攻击()
p_doubleattack()

*被动技能 重击()//攻击伤害不增加，但可以击飞玩家
p_powerattack()

*被动技能 死亡毒气()//死亡后释放毒气
p_poisongas()

主动技能 能量护盾(冷却时间，护盾持续时间，护盾值)
a_shield(cooldowntime:number,runtime:number,value:number)

 */
const SkillFactory = {
    /**
     * @param {Monster} monster 
     * @param {string} id
     * @param {any} params
     */
    create(monster,id, params) {
        switch (id) {
            case "p_CoreStats":
                return new CoreStats(monster,params);
            case "a_pounce":
                return new PounceSkill(monster,params);
            case "p_doubleattack":
                return new DoubleAttackSkill(monster);
            case "p_powerattack":
                return new PowerAttackSkill(monster);
            case "p_poisongas":
                return new PoisonGasSkill(monster);
            case "a_shield":
                return new ShieldSkill(monster,params);
            default:
                return null;
        } 
    }
};

const MonsterState = {
    IDLE: 0,//空闲
    CHASE: 1,//追人
    ATTACK: 2,//攻击
    SKILL:  3,//技能
    DEAD: 4//死亡
};
class Monster {
    /**
     * @param {number} id
     * @param {import("cs_script/point_script").Vector} position
     * @param {any} typeConfig
     * @param {NavMesh} pathfinder
     */
    constructor(id,position,typeConfig,pathfinder) {
        this.id = id;

        /**@type {Entity} */
        this.model;
        /**@type {Entity} */
        this.breakable;
        /**
         * @type {SkillTemplate[]}
         */
        this.skills = [];
        this.type = typeConfig.name;

        //基础属性
        this.maxhealth=typeConfig.baseHealth;
        this.health = typeConfig.baseHealth;
        this.damage = typeConfig.baseDamage;
        this.speed = typeConfig.speed;
        this.attackdist = typeConfig.attackdist;
        /** @type {number} */
        this.baseReward = typeConfig.reward;
        this.atc=typeConfig.attackCooldown;

        this.occupation = "";

        //死亡回调
        this.killer=null;
        this.onDeath = null;
        this.initEntities(position,typeConfig.template_name);
        
        this.onAttack = null;
        this.onSkill=null;

        this.state = MonsterState.IDLE;
        this.target = null;
        this.lastTargetUpdate = 0;
        this.attackCooldown = 0;
        this.lasttick=0;

        //这里添加被动技能和主动技能
        this.initSkills(typeConfig.skill_pool);
        this.movelocomotion=new NPCLocomotion(this,this.breakable);
        switch(typeConfig.movementmode)
        {
            case "OnGround":
                this.movelocomotion.controller.setMode("walk");
                break;
            case "Onfly":
                this.movelocomotion.controller.setMode("fly");
                break;
            default:
                this.movelocomotion.controller.setMode("walk");
                break;
        }
        this.animator = new MonsterAnimator(this.model, typeConfig);
        this.animator.setonStateFinish((state)=>{
            if(state==MonsterState.ATTACK)this.onOccupationEnd("attack");
            else if(state==MonsterState.SKILL)this.onOccupationEnd("skill");
            else if(state==MonsterState.DEAD){
                //清理模型
                this.model.Remove();
                this.breakable.Remove();
            }
        });
        //每次只执行一个skill，后一个skill覆盖前一个skill
        this.skillRequestid="";

        this.pathfinder=pathfinder;
        //this.canupdatepath=false;//是否允许更新路径
    }
    /**初始化技能
     * @param {any} skillPool
     */
    initSkills(skillPool) {
        if (!skillPool) return;
        for (const cfg of skillPool) {
            if (Math.random() > cfg.chance) continue;
            const skill = SkillFactory.create(this,cfg.id, cfg.params);
            if (!skill) continue;
            this.addSkill(skill);
        }
    }
    /**增加技能
     * @param {SkillTemplate}skill 
     */
    addSkill(skill) {
        this.skills.push(skill);
        skill.onAdd();
    }
    // 初始化所有实体
    /**
     * @param {import("cs_script/point_script").Vector} position
     * @param {string} tempname 
     */
    initEntities(position,tempname) {
        const template = Instance.FindEntityByName(tempname);
        if (template && template instanceof PointTemplate) {
            const spawned = template.ForceSpawn(position);
            if (spawned && spawned.length > 0) {
                spawned.forEach((element,i) => {
                    if(element.GetClassName()=="func_breakable")
                    {
                        this.breakable=element;
                    }
                    if(element.GetClassName()=="prop_dynamic")
                    {
                        this.model=element;
                    }
                });
            }
        }
        if(this.breakable)
        {
            this.breakable.Teleport({position:{x:position.x,y:position.y,z:position.z+8}});
            Instance.ConnectOutput(this.breakable,"OnHealthChanged",(e)=>{
                if(e.activator&&e.activator instanceof CSPlayerPawn)
                {
                    if(typeof e.value=="number")
                    {
                        const alldamage=10000*(1-e.value);
                        const newhp=this.maxhealth-alldamage;
                        const damage=this.health-newhp;
                        this.takeDamage(damage,e.activator);
                    }
                }
            });
        }
    }
    // 受到伤害
    /**
     * @param {number} amount
     * @param {CSPlayerPawn | null} attacker
     */
    takeDamage(amount, attacker) {
        if (this.state==MonsterState.DEAD)return true; // 死亡
        const previousHealth = this.health;
        this.health -= amount;
        this.emitEvent({ type: "OntakeDamage",value:amount,health:this.health});
        Instance.Msg(`怪物 #${this.id} 受到 ${amount} 点伤害 (${previousHealth} -> ${this.health})`);
        if (this.health <= 0) {
            this.die(attacker);
            return true; // 死亡
        }
        return false; // 存活
    }
    /**
     * @param {CSPlayerPawn | null} killer
     */
    die(killer) {
        // 播放死亡效果
        Instance.EntFireAtTarget({target:this.breakable,input:"fireuser1",activator:killer??this.target??undefined});
        this.state=MonsterState.DEAD;
        this.emitEvent({ type: "OnDie"});
        // 触发死亡回调
        if (this.onDeath) {
            this.onDeath(this, killer);
        }
        this.killer=killer;
        // 清理模型,不应该立即清理，这里强制播放死亡动画，等动画播放完后清理
        ///this.model.Remove();
        ///this.breakable.Remove();
        this.animator.enter(MonsterState.DEAD);
        Instance.Msg(`怪物 #${this.id} 死亡`);
    }
    // 设置死亡回调
    /**
     * @param {(monsterInstance: Monster, killer: null|CSPlayerPawn) => void} callback
     */
    setOnDeath(callback) {
        this.onDeath = callback;
    }
    // 设置攻击回调
    /**
     * @param {(damage: number, target: CSPlayerPawn) => void} callback
     */
    setOnAttack(callback) {
        this.onAttack = callback;
    }
    // 设置技能回调，就是给玩家加buff
    /**
     * @param {(id: string, target: CSPlayerPawn) => void} callback
     */
    setOnSkill(callback) {
        this.onSkill = callback;
    }
    /**
     * @param {Entity[]} allmpos
     */
    tick(allmpos) {
        switch (this.state) {
            case MonsterState.IDLE:
                Instance.DebugScreenText({ text: this.id+":IDLE",x: 400, y: 80+this.id*10, duration: 1/32 });
                break;
            case MonsterState.CHASE:
                Instance.DebugScreenText({ text: this.id+":CHASE",x: 400, y: 80+this.id*10, duration: 1/32 });
                break;
            case MonsterState.ATTACK:
                Instance.DebugScreenText({ text: this.id+":ATTACK",x: 400, y: 80+this.id*10, duration: 1/32 });
                break;
            case MonsterState.SKILL:
                Instance.DebugScreenText({ text: this.id+":SKILL",x: 400, y: 80+this.id*10, duration: 1/32 });
                break;
        }
        if (!this.model || !this.breakable?.IsValid()) return;
        if(this.state==MonsterState.DEAD)return;
        //更新tick
        const now = Instance.GetGameTime();
        const dt= now-this.lasttick;
        this.lasttick=now;
        if (this.attackCooldown > 0)this.attackCooldown -= dt;

        this.emitEvent({ type: "OnTick", dt,allmpos });
        for (const skill of this.skills) {
            if (!skill.running) continue;
            skill.tick();
        }
        if (now - this.lastTargetUpdate > 3.0||!this.target) {
            this.updateTarget();
            this.lastTargetUpdate = now;
        }
        if(!this.target)return;
        
        if (this.isOccupied()) {
            // 占用态只允许相关模块继续运行
            if(this.state!=MonsterState.SKILL)
            {//允许攻击移动，技能能不能移动靠技能本身
                this.movelocomotion.resume();
                this.movelocomotion.update(dt,allmpos);
            }
            //this.canupdatepath=false;
            return; // 🔴 非常关键：不进入 Think / Decide
        }
        //Think：思考本帧“意图”（不产生副作用）
        const intent = this.evaluateIntent();
        //Decide：能力询问 + 动作仲裁
        this.resolveIntent(intent);
        //Execute：执行当前状态对应模块
        // 8. 更新路径标记
        //this.canupdatepath=true;
        // 9. 移动
        this.movelocomotion.resume();
        if(this.state!=MonsterState.IDLE)this.movelocomotion.update(dt,allmpos);
        // 10. 动画
        this.animator.tick(this.state);
    }
    updateTarget() {
        const players = Instance.FindEntitiesByClass("player");
        let best = null;
        let bestDist = Infinity;
        for (const p of players) {
            if (!(p instanceof CSPlayerPawn) || !p.IsAlive()||(p.GetTeamNumber()&targetTeam)!=1) continue;
            const d = this.distanceTo(p);
            if (d < bestDist) {
                best = p;
                bestDist = d;
            }
        }
        this.target = best;
        this.emitEvent({ type: "OnupdateTarget"});
    }
    /**
     * 当前状态是否锁定
     */
    isOccupied() {
        return this.occupation !="";
    }
    /**
     * 发生事件，尝试执行，
     * @param {any} event
     */
    emitEvent(event) {
        for (const skill of this.skills) {
            if (!skill.canTrigger(event)) continue;
            //event只要不是runSkill就只是触发一下，让技能请求动画，动画播放技能被runskill触发
            skill.request();//请求执行
        }
    }
    /**
     * // evaluateIntent 只能“判断想做什么”，
     * // ❌ 不允许改 state
     * // ❌ 不允许启动技能
     */
    evaluateIntent() {
        if (!this.target)return MonsterState.IDLE;

        const dist = this.distanceTo(this.target);
        // 技能优先级可以放这里（只“想”，不执行）
        //for (const skill of this.skills) {
        //    if (skill.canTrigger(this, { type: "evaluateIntent" })) {
        //        return MonsterState.SKILL;
        //    }
        //}
        if (this.skillRequestid!="")return MonsterState.SKILL;

        if (dist <= this.attackdist&& this.attackCooldown <= 0)return MonsterState.ATTACK;

        return MonsterState.CHASE;
    }
    /**进入状态
     * @param {number} intent
     */
    resolveIntent(intent) {
        switch (intent) {

            case MonsterState.IDLE:
                this.trySwitchState(MonsterState.IDLE);
                break;

            case MonsterState.CHASE:
                this.trySwitchState(MonsterState.CHASE);
                break;

            case MonsterState.ATTACK:
                if(this.trySwitchState(MonsterState.ATTACK))
                {
                    this.enterAttack();
                }
                break;
            case MonsterState.SKILL:
                if(this.trySwitchState(MonsterState.SKILL))
                {
                    this.enterSkill();
                }
                break;
        }
    }
    /**
     * 尝试切换到目标状态
     * @param {number} nextState - MonsterState
     * @returns {boolean} 是否切换成功
     */
    trySwitchState(nextState) {
        if (this.state === nextState) return true;
        if (this.state === MonsterState.DEAD)return false;
        if (this.isOccupied()) return false;
        if (!this.animator.canSwitch(nextState)) return false;

        this.state = nextState;
        this.animator.enter(nextState);

        return true;
    }
    enterSkill() {
        this.movelocomotion.stop();
        this.occupation = "skill";
        for (const skill of this.skills) {
            if(skill.id==this.skillRequestid)
            {
                skill.trigger();//技能触发
                break;
            }
        }
        this.skillRequestid="";
    }
    enterAttack() {
        if (!this.target) return;
        this.occupation= "attack";
        this.attackCooldown = this.atc; // 攻击间隔

        const a = this.breakable.GetAbsOrigin();
        const b = this.target.GetAbsOrigin();
        const dist = this.distanceTo(this.target);
        if(dist > this.attackdist)
        {
            //没有攻击到
            this.emitEvent({ type: "OnattackFalse"});
            return;
        }
        //这里造成伤害
        300 / Math.hypot(b.x - a.x, b.y - a.y);
        this.emitEvent({ type: "OnattackTrue"});

        {
            //手动造成伤害
            this.target.TakeDamage({damage:this.damage});
            return;
        }
        //this.target.Teleport({
        //    velocity: { x: (b.x - a.x) * l, y: (b.y - a.y) * l, z: 150 }
        //});
    }
    /**
     * @param {CSPlayerPawn} ent
     */
    distanceTo(ent) {
        const a = this.model.GetAbsOrigin();
        const b = ent.GetAbsOrigin();
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }
    /**
     * 功能模块上报占用结束
     * @param {string} type - "pounce" | "skill"
     */
    onOccupationEnd(type) {
        // 防止过期 / 重复回调
        if (this.occupation !== type) return;
        this.occupation = "";
    }
    /**
     * @param {string} id
     */
    requestSkill(id)
    {
        this.skillRequestid = id;
    }
    updatepath()
    {
        //if(this.canupdatepath==false)return false;
        if(!this.target)return false;
        const s=this.breakable.GetAbsOrigin();
        const e=this.target.GetAbsOrigin();
        const pp=this.pathfinder.findPath(s,e);
        pp.push({pos:e,mode:1});//让其始终有值
        this.movelocomotion.setPath(pp);
        return true;
    }
}

class MonsterManager {
    constructor() {
        /** @type {Map<number,Monster>} */
        this.monsters = new Map();
        /** @type {number} */
        this.nextMonsterId = 1;
        /** @type {number} */
        this.activeMonsters = 0; // 当前活跃怪物数量
        /** @type {number} */
        this.totalKills = 0; // 总击杀数
        /** @type {number} */
        this.totalReward = 0; // 总奖励
        this.totaltick=-1;
        // 事件回调
        this.onMonsterSpawn = null; // 怪物生成回调
        this.onMonsterDeath = null; // 怪物死亡回调
        this.onAllMonstersDead = null; // 所有怪物死亡回调
        this.onAttack=null;//怪物攻击回调
        this.onSkill=null;//怪物技能回调
        /** @type {NavMesh} */
        this.pathfinder=new NavMesh();
        this.pathfinder.init();
        this.pathfinder.debug();
        this.pathlist=new MinHeap(1000);
        this.pretick=-1;

        this.spawnpretick=-1;        //上一个怪物什么时候生成的
        this.spawnmonstercount=0;    //生成了多少个怪物了
        this.spawn=false;            //是否启用生成怪物
        this.spawnconfig=null;       //生成的config
    }
    // 生成一批怪物
    /**
     * @param {null|{name:string,totalMonsters:number,reward:number,spawnInterval:number,preparationTime:number,monsterTypes:{name: string, baseHealth: number, baseDamage: number, speed: number, reward: number}[]}} waveConfig
     */
    spawnWave(waveConfig) {
        if (!waveConfig || waveConfig.totalMonsters <= 0) return;
        this.spawnpretick=-1;
        this.spawnmonstercount=0;
        this.spawn=true;
        this.spawnconfig=waveConfig;
    }
    // 停止生成怪物
    stopWave()
    {
        this.spawn=false;
    }
    // 生成单个怪物
    /**
     * @param {{name:string,totalMonsters:number,reward:number,spawnInterval:number,preparationTime:number,monsterTypes:{name: string, baseHealth: number, baseDamage: number, speed: number, reward: number}[]}} waveConfig
     */
    spawnMonster(waveConfig) {
        try {
            // 获取生成点
            const spawnPointNames = waveConfig.monster_spawn_points_name;
            /**@type {Entity[]} */
            const spawnPoints =[];
            spawnPointNames.forEach(e => {
                const i=Instance.FindEntitiesByName(e);
                spawnPoints.push(...i);
            });
            if (spawnPoints.length === 0) {
                Instance.Msg("错误: 未找到怪物生成点");
                return null;
            }
            
            // 随机选择生成点
            const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
            const pos=spawnPoint.GetAbsOrigin();
            const mins={x:-30,y:-30,z:-30};
            const maxs={x:30,y:30,z:30};//整个breakable大小20*20*40
            const start={ x: pos.x, y: pos.y, z: pos.z+ 45};
            const end={ x: pos.x, y:pos.y, z: pos.z+ 50};
            //检查周围是否遮挡
            if(Instance.TraceBox({ mins, maxs,start,end, ignorePlayers: true }).hitEntity)
            {
                Instance.Msg("错误: 生成点有遮挡");
                return null;
            }
            // 创建怪物ID
            const monsterId = this.nextMonsterId++;
            
            // 创建怪物实例
            // 这里调用 Monster 类的构造函数
            // 参数包括：ID, 位置, 朝向, 怪物类型, 波次配置
            
            const monster = new Monster(
                monsterId,
                end,
                this.getMonsterType(waveConfig, monsterId),
                this.pathfinder
            );
            // 设置怪物死亡回调
            monster.setOnDeath((monsterInstance, killer) => {
                this.handleMonsterDeath(monsterInstance, killer);
            });
            monster.setOnAttack((damage, target)=>{
                if(this.onAttack)this.onAttack(damage, target);
            });
            monster.setOnSkill((id,target)=>{
                if(this.onSkill)this.onSkill(id,target);
            });
            // 存储怪物
            this.monsters.set(monsterId, monster);
            this.activeMonsters++;
            this.pathlist.push(monsterId,-1);

            // 触发生成回调
            if (this.onMonsterSpawn) {
                this.onMonsterSpawn(monster);
            }
            
            Instance.Msg(`生成怪物 #${monsterId} ${monster.type} HP:${monster.health}`);
            
            return monster;
            
        } catch (error) {
            Instance.Msg(`生成怪物失败: ${error}`);
            return null;
        }
    }
    // 处理怪物死亡
    /**
     * @param {Monster} monsterInstance
     * @param {import("cs_script/point_script").Entity|null|undefined} killer
     */
    handleMonsterDeath(monsterInstance, killer) {
        const monsterId = monsterInstance.id;
        
        // 记录击杀
        this.activeMonsters--;
        this.totalKills++;
        
        // 计算并发放奖励
        const reward = monsterInstance.baseReward;
        this.totalReward += reward;
        
        // 从地图中移除
        this.monsters.delete(monsterId);
        
        // 触发死亡回调
        if (this.onMonsterDeath) {
            this.onMonsterDeath(monsterInstance, killer, reward);
        }
        
        // 检查是否所有怪物都死亡了
        if (this.activeMonsters <= 0&&this.spawn==false) {
            this.triggerAllMonstersDead();
        }
        
        Instance.Msg(`怪物 #${monsterId} 死亡，奖励: ${reward}`);
    }
    /**
     * 清理所有怪物
     */
    cleanup() {
        // 调用每个怪物的清理方法
        for (const [id, monster] of this.monsters) {
            try {
                monster.die(null);
            } catch (error) {
                Instance.Msg(`清理怪物 #${id} 失败: ${error}`);
            }
        }
        
        // 清空管理器
        this.monsters.clear();
        this.activeMonsters = 0;
        this.pathlist.clear();

        Instance.Msg("所有怪物已清理");
    }
    // 强制杀死所有怪物
    killAllMonsters() {
        const killed = [];
        
        for (const [id, monster] of this.monsters) {
            try {
                monster.die(null);
                killed.push(id);
            } catch (error) {
                Instance.Msg(`杀死怪物 #${id} 失败: ${error}`);
            }
        }
        
        Instance.Msg(`强制杀死 ${killed.length} 个怪物`);
        return killed;
    }

    tick()
    {
        this.totaltick++;
        const now=Instance.GetGameTime();
        //每次更新一个怪物的路径。
        let first=-1;
        while (!this.pathlist.isEmpty()) 
        {
            const current = this.pathlist.pop();
            if(current.node==first||now-current.cost<=0.5)//不能更新太勤快，不然怪物在悬崖边旋转
            {
                this.pathlist.push(current.node, current.cost);
                break;//循环了说是，或者更新太快
            }
            if(first==-1)first=current.node;
            if(this.monsters.has(current.node))
            {
                const ms=this.monsters.get(current.node);
                if(!ms)continue;
                this.pathlist.push(current.node, Instance.GetGameTime());
                if(ms.updatepath())break;
            }
        }
        const allmpos=this.getActiveMonsters().map(function(item){
            return item.breakable;
        });
        for (const [id, monster] of this.monsters) {
            try {
                if(this.totaltick%2==id%2)monster.tick(allmpos);
            } catch (error) {
                Instance.Msg(`更新怪物 #${id} 失败: ${error}`);
            }
        }
        if(this.spawn==true)
        {
            if(!this.spawnconfig)return;
            if(this.spawnmonstercount>=this.spawnconfig.totalMonsters)
            {
                this.spawn=false;
                return;
            }
            if(now-this.spawnpretick>=this.spawnconfig.spawnInterval)///////生成间隔
            {
                //根据人数设置同一时间僵尸个数
                if(this.activeMonsters>=this.spawnconfig.aliveMonster)return;///////生成个数
                if(this.spawnmonstercount<this.spawnconfig.totalMonsters)
                {
                    let monster = this.spawnMonster(this.spawnconfig);
                    if(monster)
                    {
                        this.spawnmonstercount++;
                        this.spawnpretick=now;
                    }
                }
            }
        }
    }
    // 获取怪物类型（根据波次配置和ID）
    /**
     * @param {{ totalMonsters?: number; monsterTypes?: {name: string, baseHealth: number, baseDamage: number, speed: number, reward: number}[]; }} waveConfig
     * @param {number} monsterId
     */
    getMonsterType(waveConfig, monsterId) {
        // 如果有多种怪物类型，根据波次配置分配
        if (waveConfig.monsterTypes && waveConfig.monsterTypes.length > 0) {
            // 简单轮询分配类型
            const typeIndex = monsterId % waveConfig.monsterTypes.length;
            return waveConfig.monsterTypes[typeIndex];
        }
        
        // 默认怪物类型
        return {
            name: "Zombie",
            baseHealth: 100,
            baseDamage: 10,
            speed: 250,
            reward: 100,
        };
    }
    // 通过ID获取怪物
    /**
     * @param {number} id
     */
    getMonsterById(id) {
        return this.monsters.get(id);
    }
    
    // 获取所有怪物
    getAllMonsters() {
        return Array.from(this.monsters.values());
    }
    
    // 获取活跃怪物列表
    getActiveMonsters() {
        return Array.from(this.monsters.values()).filter(monster => monster.state!=MonsterState.DEAD);
    }
    
    // 获取所有怪物的ID
    getAllMonsterIds() {
        return Array.from(this.monsters.keys());
    }
    
    // 获取怪物数量
    getMonsterCount() {
        return this.activeMonsters;
    }
    
    // 获取总击杀数
    getTotalKills() {
        return this.totalKills;
    }
    
    // 获取总奖励
    getTotalReward() {
        return this.totalReward;
    }
    
    // 重置统计数据
    resetStats() {
        this.totalKills = 0;
        this.totalReward = 0;
    }
    // 触发所有怪物死亡事件
    triggerAllMonstersDead() {
        if (this.onAllMonstersDead) {
            this.onAllMonstersDead(this.totalKills, this.totalReward);
        }
    }
    
    // 设置事件回调
    /**
     * @param {(monster: Monster) => void} callback
     */
    setOnMonsterSpawn(callback) {
        this.onMonsterSpawn = callback;
    }
    
    /**
     * @param {(monster: Monster, killer: Entity|null|undefined, reward: number) => void} callback
     */
    setOnMonsterDeath(callback) {
        this.onMonsterDeath = callback;
    }
    
    /**
     * @param {(totalKills: number, totalReward: number) => void} callback
     */
    setOnAllMonstersDead(callback) {
        this.onAllMonstersDead = callback;
    }
    /**
     * @param {(damage: number, target: CSPlayerPawn) => void} callback
     */
    setOnAttack(callback) {
        this.onAttack = callback;
    }
    // 设置技能回调，就是给玩家加buff
    /**
     * @param {(id: string, target: CSPlayerPawn) => void} callback
     */
    setOnSkill(callback) {
        this.onSkill = callback;
    }
    // 获取管理器状态
    getStatus() {
        return {
            totalMonsters: this.monsters.size,
            activeMonsters: this.activeMonsters,
            nextId: this.nextMonsterId,
            totalKills: this.totalKills,
            totalReward: this.totalReward
        };
    }
}
class MinHeap {
    /**
     * @param {number} polyCount
     */
    constructor(polyCount) {
        this.nodes = new Int32Array(polyCount);
        this.costs = new Float32Array(polyCount);
        this.index = new Int32Array(polyCount).fill(-1);
        this.size = 0;
    }
    clear() {
        this.index.fill(-1);
        this.size = 0;
    }
    isEmpty() {
        return this.size === 0;
    }

    /**
     * @param {number} node
     * @param {number} cost
     */
    push(node, cost) {
        let i = this.size++;
        this.nodes[i] = node;
        this.costs[i] = cost;
        this.index[node] = i;
        this._up(i);
    }

    pop() {
        if (this.size === 0) return {node:-1,cost:-1};
        const topNode = this.nodes[0];
        const topcost= this.costs[0];
        this.index[topNode] = -1;
        this.size--;
        if (this.size > 0) {
            this.nodes[0] = this.nodes[this.size];
            this.costs[0] = this.costs[this.size];
            this.index[this.nodes[0]] = 0;
            this._down(0);
        }
        return {node:topNode,cost:topcost};
    }

    /**
     * @param {number} node
     * @param {number} cost
     */
    update(node, cost) {
        const i = this.index[node];
        if (i == null) return;
        this.costs[i] = cost;
        this._up(i);
    }

    /**
     * @param {number} i
     */
    _up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.costs[p] <= this.costs[i]) break;
            this._swap(i, p);
            i = p;
        }
    }

    /**
     * @param {number} i
     */
    _down(i) {
        const n = this.size;
        while (true) {
            let l = i * 2 + 1;
            let r = l + 1;
            let m = i;

            if (l < n && this.costs[l] < this.costs[m]) m = l;
            if (r < n && this.costs[r] < this.costs[m]) m = r;
            if (m === i) break;

            this._swap(i, m);
            i = m;
        }
    }

    /**
     * @param {number} a
     * @param {number} b
     */
    _swap(a, b) {
        const ca = this.costs[a];
        const cb = this.costs[b];
        const na = this.nodes[a];
        const nb = this.nodes[b];
        this.costs[a] = cb;
        this.costs[b] = ca;
        this.nodes[a] = nb;
        this.nodes[b] = na;
        this.index[na] = b;
        this.index[nb] = a;
    }
}

//import { sleep,m_sleepList, tickCallback } from "./game_sleep";
// 游戏状态管理
class PvEGameManager {
    constructor() {
        /** @type {string} */
        this.gameState = 'WAITING'; // WAITING, PREPARE, PLAYING, WON, LOST
        /** @type {WaveManager} */
        this.WaveManager=new WaveManager();
        /** @type {MonsterManager} */
        this.MonsterManager=new MonsterManager();
        // 波次开始事件
        this.WaveManager.setOnWaveStart((waveNumber, waveConfig) => {
            // 通知怪物管理器生成怪物
            this.MonsterManager.spawnWave(waveConfig);
        });
        // 波次完成事件
        this.WaveManager.setOnWaveComplete((waveNumber, waveConfig) => {
            // 给予玩家奖励
            this.PlayerManager?.giveWaveReward(waveConfig?.reward??0);
            
            // 清理怪物管理器
            this.MonsterManager.stopWave();
            this.MonsterManager.cleanup();
            this.MonsterManager.resetStats();
        });
        // 怪物生成事件
        this.MonsterManager.setOnMonsterSpawn((monster) => {
            console.log(`怪物 #${monster.id} 已生成`);
        });
        this.MonsterManager.setOnAttack((damage,target) => {
            const controller=target.GetPlayerController();
            if(controller)
            {
                const playerSlot = controller.GetPlayerSlot();
                this.PlayerManager?.takeDamage(playerSlot, damage);
            }
        });
        this.MonsterManager.setOnSkill((id,target) => {
            const controller=target.GetPlayerController();
            if(controller)
            {
                const playerSlot = controller.GetPlayerSlot();
                this.PlayerManager?.addBuff(playerSlot, id);
            }
        });
        // 怪物死亡事件
        this.MonsterManager.setOnMonsterDeath((monster, killer, reward) => {
            // 给予玩家奖励
            if(killer && killer instanceof CSPlayerPawn)
            {
                const controller=killer.GetPlayerController();
                if(controller)
                {
                    const playerSlot = controller.GetPlayerSlot();
                    this.PlayerManager?.giveExp(playerSlot, reward,"击杀怪物");
                    this.PlayerManager?.giveMoney(playerSlot, reward,"击杀怪物");
                }
            }
        });
        
        // 所有怪物死亡事件
        this.MonsterManager.setOnAllMonstersDead((totalKills, totalReward) => {
            // 通知WaveManager波次完成
            this.WaveManager.completeWave();
        });

        // 玩家死亡事件
        this.PlayerManager?.setOnPlayerDeath((playerPawn) => {
            console.log(`玩家 ${playerPawn.GetPlayerController()?.GetPlayerName()} 死亡`);
            this.checkGameState();
        });
        // 玩家准备事件
        this.PlayerManager?.setOnPlayerReady((playerData, isReady) => {
            // 如果所有玩家都准备好了，开始游戏
            if (this.PlayerManager.areAllPlayersReady()) {
                this.startGame();
            }
        });
        this.PlayerManager?.setOnPlayerRespawn((player_data)=>{
            if(this.gameState=="WAITING")
            {
                this.enterPreparePhase();
            }
        });
        this.PlayerManager?.setOnPlayerJoin((player_data)=>{
            if(this.gameState=="WAITING")
            {
                this.enterPreparePhase();
            }
        });
    }
    
    init() {
        this.PlayerManager?.setupEventListeners();
        // 监听玩家断开连接
        //Instance.OnPlayerDisconnect((event) => {
        //    this.checkGameState();
        //});
        Instance.SetThink(() => {
            //this.tick();
            this.PlayerManager?.tick(Instance.GetGameTime());
            this.WaveManager.tick();
            this.MonsterManager.tick();
            Instance.SetNextThink(Instance.GetGameTime()+1/64);
        });
        Instance.SetNextThink(Instance.GetGameTime()+1/64);
        {
            //强制结束当前波次
            Instance.OnScriptInput("endWave",()=>{
                this.WaveManager.completeWave();
            });
            //开启波次
            Instance.OnScriptInput("startWave",(e)=>{
                if(!e.caller)return;
                const te=e.caller.GetEntityName();
                const tes=te.split('_');
                this.WaveManager.startWave(parseInt(tes[tes.length-1]));
            });
        }
    }
    
    // 进入准备阶段
    enterPreparePhase() {
        this.gameState = 'PREPARE';
        this.PlayerManager?.resetAllReadyStatus();
        this.broadcastMessage("=== 准备阶段开始 ===");
        this.broadcastMessage("输入 !r 或 !ready 准备");
        this.broadcastMessage(`等待玩家准备... (0/${this.PlayerManager?.getPlayerStats().active})`);
    }
    
    // 开始游戏
    startGame() {
        if (this.gameState !== 'PREPARE') return;

        this.gameState = 'PLAYING';

        this.broadcastMessage("=== 游戏开始 ===");
        
        // 开始生成怪物（需要与地图实体配合）
        this.WaveManager.startWave(1);
        
        // 重置玩家状态
        this.PlayerManager?.resetPlayerGameStatus();
    }
    // 3. 游戏胜利/失败判断
    checkGameState() {
        if (this.gameState !== 'PLAYING') return;
        
        // 检查是否所有玩家死亡
        if (this.PlayerManager?.hasAlivePlayers() === false) {
            this.gameLost();
            return;
        }
    }
    
    // 游戏失败
    gameLost() {
        this.gameState = 'LOST';
        this.broadcastMessage("=== 游戏失败 ===");
        this.broadcastMessage("所有玩家阵亡！");
        
        //this.resetGame();
    }
    
    // 游戏胜利
    gameWon() {
        this.gameState = 'WON';
        this.broadcastMessage("=== 游戏胜利 ===");
        // 进入下一波或结束游戏
        //this.resetGame();
    }

    // 回合重置
    resetGame() {
        // 重置玩家状态
        this.PlayerManager?.resetAllReadyStatus();
        this.PlayerManager?.resetPlayerGameStatus();

        // 清除所有怪物
        this.WaveManager.resetGame();
        this.MonsterManager.cleanup();
        this.MonsterManager.resetStats();

        this.broadcastMessage("5秒后重置游戏...");
        Instance.ServerCommand("mp_restartgame 5");

        // 重置游戏状态
        this.gameState = 'WAITTING';
        
        // 返回准备阶段
        this.enterPreparePhase();
    }
    /**
     * @param {string} message
     */
    broadcastMessage(message) {
        Instance.Msg(message);
        //Instance.ServerCommand(`say ${message}`);
    }
    /**
     * @param {number} playerSlot
     * @param {string} message
     */
    sendMessageToPlayer(playerSlot, message) {
        const player = Instance.GetPlayerController(playerSlot);
        if (player) {
            Instance.Msg(message);
            //Instance.ClientCommand(playerSlot, `say ${message}`);
        }
    }
}

Instance.ServerCommand("mp_warmup_offline_enabled 1");
Instance.ServerCommand("mp_warmup_pausetimer 1");
Instance.ServerCommand("mp_roundtime 60");
Instance.ServerCommand("mp_freezetime 1");
Instance.ServerCommand("mp_ignore_round_win_conditions 1");
Instance.ServerCommand("weapon_accuracy_nospread 1");
//let position={x: 0,y: 0,z: 0};
//let eye={pitch: 0,yaw: 0,roll: 0};
//let pd=false;
//Instance.SetThink(() => {
//    var players=Instance.FindEntitiesByClass("player");
//    players.forEach((e)=>{
//        if(e&&e instanceof CSPlayerPawn)
//        {
//            var p=e.GetPlayerController()?.GetPlayerPawn();
//            if(pd==false)return;
//            if(p)
//            {
//                const ang=p.GetAbsAngles();
//                const pos=p.GetAbsVelocity();
//                const poss=p.GetAbsOrigin();
//                const eyed=p.GetEyePosition().z-poss.z;
//                const { forward, right } = yawToVectors(p.GetEyeAngles().yaw);
//
//                const forwardSpeed = dot(pos, forward);
//                const sideSpeed    = dot(pos, right);
//                const input = {
//                    W: false,
//                    A: false,
//                    S: false,
//                    D: false,
//                };
//                if(Math.abs(forwardSpeed)>Math.abs(sideSpeed))
//                {
//                    if (forwardSpeed >  1) input.W = true;
//                    if (forwardSpeed < -1) input.S = true;
//                }
//                else
//                {
//                    if (sideSpeed <  -1) input.D = true;
//                    if (sideSpeed > 1) input.A = true;
//                }
//                Instance.DebugScreenText({text:`按下按键：${input.W?"W":" "} ${input.S?"S":" "} ${input.A?"A":" "} ${input.D?"D":" "} ${pos.z>10?"JUMP":" "} ${eyed<=46?"CTRL":" "}`,x:250,y:170,duration:1/64});
//                Instance.DebugScreenText({text:`是否进入商店:${pd?"true":"false"}`,x:250,y:230,duration:1});
//                //p.Teleport({velocity:{x:0.5,y:0.5,z:pos.z}});
//                p.Teleport({position:{x:position.x,y:position.y,z:poss.z},angles:{pitch:ang.pitch,roll:ang.roll,yaw:eye.yaw}});
//                return;
//            }
//        }
//    })
//    Instance.SetNextThink(Instance.GetGameTime()+1/64);
//});
//Instance.SetNextThink(Instance.GetGameTime()+1/64);
//Instance.OnPlayerChat((event) => {
//    const text = (event.text || "").trim().toLowerCase().split(' ')[0];
//    const num=Number((event.text || "").trim().toUpperCase().split(' ')[1]);
//    if (text === "shop" || text === "!shop")
//    {
//        if(event.player)
//        {
//            const eee=event.player.GetAbsAngles();
//            eye.pitch=eee.pitch;
//            eye.roll=eee.roll;
//            eye.yaw=eee.yaw;
//            const ooo=event.player.GetAbsOrigin();
//            position.x=ooo.x;
//            position.y=ooo.y;
//            position.z=ooo.z;
//        }
//        pd=!pd;
//    }
//});

let m_PvEGameManager=new PvEGameManager();
Instance.OnScriptReload({
    before: () => {
        // 保存需要持久化的数据
    },
    after: () => {
        // 重新初始化，恢复数据
        m_PvEGameManager = new PvEGameManager();
        m_PvEGameManager.init();
    }
});
Instance.OnScriptInput("restart",()=>{
    m_PvEGameManager.resetGame();
});

//Instance.SetThink(() => {
//    const tr=Instance.TraceSphere({radius:30,start:{x:100,y:100,z:100},end:{x:100,y:100,z:100},ignorePlayers:true});
//    if(tr&&tr.didHit)Instance.DebugSphere({radius:30,center:tr.end,duration:1});
//    
//    Instance.SetNextThink(Instance.GetGameTime()+1/1);
//});
//Instance.SetNextThink(Instance.GetGameTime()+1/1);
//导航网格调试debug
//let pathfinder = new NavMesh();
//let path_ini=false;
//function init()
//{
//    if(path_ini)return;
//    let start = new Date();
//    Instance.Msg("导航初始化中");
//    pathfinder.init();
//    let end = new Date();
//    Instance.Msg(`导航初始化完成,耗时${end.getTime()-start.getTime()}ms`);
//    path_ini=true;
//}
//Instance.OnPlayerChat((event) => {
//    const text = (event.text || "").trim().toLowerCase().split(' ')[0];
//    const num=Number((event.text || "").trim().toUpperCase().split(' ')[1]);
//    if (text === "debug" || text === "!debug")
//    {
//        init();
//        pathfinder.debug(60);
//        pd=true;
//    }
//    if (text === "c" || text === "!c")
//    {
//        const p=event.player?.GetPlayerPawn();
//        if(p)
//        {
//            const pos=p.GetAbsOrigin();
//            start={x:pos.x,y:pos.y,z:pos.z};
//        }
//    }
//    if (text === "v" || text === "!v")
//    {
//        const p=event.player?.GetPlayerPawn();
//        if(p)
//        {
//            const pos=p.GetAbsOrigin();
//            end={x:pos.x,y:pos.y,z:pos.z};
//        }
//    }
//});
//Instance.SetThink(() => {
//    if(pd==true)
//    {
//        var players=Instance.FindEntitiesByClass("player");
//        players.forEach((e)=>{
//            if(e&&e instanceof CSPlayerPawn)
//            {
//                var p=e.GetPlayerController()?.GetPlayerPawn();
//                if(p)
//                {
//                    const pos=p.GetAbsOrigin();
//                    end={x:pos.x,y:pos.y,z:pos.z};
//                    return;
//                }
//            }
//        })
//        for(let i=0;i<1;i++)pathfinder.findPath(start,end);
//    }
//    Instance.SetNextThink(Instance.GetGameTime()+1/32);
//});
//Instance.SetNextThink(Instance.GetGameTime()+1/32);
//let start={x:-90,y:-2923,z:607};
//let end={x:-90,y:-2923,z:607};
//let pd=false;
//let se=false;
//Instance.OnBulletImpact((event)=>{
//    if(se==true)end=event.position;
//    else start=event.position;
//    //se=!se;
//});
