import {CSPlayerPawn, Instance, PointTemplate } from "cs_script/point_script";
import {players_map } from "./const";
import { PathTrackTrain } from "./train";
export class monster{
    /**
     * @param {number} monsterId
     * @param {string} monsterType
     * @param {import("cs_script/point_script").Vector}position
     */
    constructor(monsterId,monsterType = "chicken",position) {
        this.monsterType = monsterType;
        /** @type {import("cs_script/point_script").Entity} */
        this.breakable;
        /** @type {import("cs_script/point_script").Entity} */
        this.model;
        this.att=0;
        const template = Instance.FindEntityByName(`monster_${monsterType}_template`);
        if (template && template instanceof PointTemplate) {
            const spawned = template.ForceSpawn(position);
            if (spawned && spawned.length > 0) {
                let breakable=0;
                let model=0;
                spawned.forEach((element,i) => {
                    element.SetEntityName(`monster_${monsterType}_${monsterId}_${element.GetClassName()}`);
                    if(element.GetClassName()=="func_physbox")
                    {
                        breakable=i;
                    }
                    if(element.GetClassName()=="prop_dynamic")
                    {
                        model=i;
                    }
                });
                this.breakable=spawned[breakable];
                this.model=spawned[model];
                this.breakable.Teleport({ position });
                this.model.Teleport({ position });
                this.model.SetParent(spawned[breakable]);
            }
        }
        this.health = 100;
        this.maxHealth = 100;
        this.attackDamage = 1;
        this.attackRange = 150;
        this.attackCooldown = 2.0; // 秒
        this.lastAttackTime = 0;
        this.isAlive = false;
        /** @type {import("cs_script/point_script").Entity|undefined} */
        this.target = undefined;
        this.thinkInterval = 5; // 思考间隔
        this.lastthinkTime = Instance.GetGameTime();
        /**@type {PathTrackTrain} */
        this.train=new PathTrackTrain(monsterId,position,300);
        this.breakable.SetParent(this.train.getTrain());
        this.isAlive = true;

        Instance.ConnectOutput(this.breakable,"OnHealthChanged",(e)=>{
            Instance.Msg("debug");
            if(e.activator&&e.activator instanceof CSPlayerPawn)
            {
                if(typeof e.value=="number")this.GetDamage(e.activator,e.value);
            }
        });
    }
    /**
     * @param {import("cs_script/point_script").CSPlayerPawn} player
     * @param {number} damagefloat
     */
    GetDamage(player,damagefloat) {
        if (this.isAlive && this.breakable && player) {
            // 检查是否是攻击这个怪物
            const playerPos = player.GetAbsOrigin();
            const monsterPos = this.breakable.GetAbsOrigin();
            const distance = this.calculateDistance(playerPos, monsterPos);
            if(player)
            {
                const damage=this.health-this.maxHealth*damagefloat;
                this.takeDamage(damage, player);
            }
            if (distance < 200&&this.target&&this.calculateDistance(this.target?.GetAbsOrigin(), monsterPos)>distance) { // 如果玩家在怪物附近
                this.target = player;
            }
        }
    }
    /**
     * 怪物思考逻辑
     */
    tick() {
        this.train.debug();
        if (!this.target || !this.target.IsValid()) {
            this.findNearestTarget();
        }
        if (this.target && this.target.IsValid()) {
            this.chaseTarget();
            this.tryAttack();
        }
    }

    /**
     * 寻找最近的目标
     */
    findNearestTarget() {
        const players = Instance.FindEntitiesByClass("player");
        const monsterPos = this.breakable.GetAbsOrigin();
        let nearestPlayer;
        let nearestDistance = Infinity;

        for (const player of players) {
            if (player.IsAlive && !player.IsAlive()) continue;
            
            const playerPos = player.GetAbsOrigin();
            const distance = this.calculateDistance(monsterPos, playerPos);
            
            if (distance < nearestDistance && distance < 1000) { // 视野范围
                nearestDistance = distance;
                nearestPlayer = player;
            }
        }

        this.target = nearestPlayer;
    }

    /**
     * 追逐目标
     */
    chaseTarget() {
        if (!this.target || !this.target.IsValid()) return;

        const monsterPos = this.model.GetAbsOrigin();
        const targetPos = this.target.GetAbsOrigin();
        const distance = this.calculateDistance(monsterPos, targetPos);

        // 如果目标太远，停止追逐
        if (distance > 2500) {
            this.train.stopTrain();
            this.target = undefined;
            return;
        }
        if(distance > this.attackRange&&this.att==0)this.att=1;
        else if(distance < this.attackRange-30&&this.att==1)this.att=0;
        // 简单的追逐逻辑 - 实际游戏中需要更复杂的路径寻找
        if (this.att) {
            //const direction = this.calculateDirection(monsterPos, targetPos);
            //const speed = 100; // 移动速度
            
            // 面向目标
            //const angles = this.calculateAnglesToTarget(targetPos);
            //Instance.Msg(`===============MONSTER====================`);
            //Instance.Msg(`x:${this.model.GetAbsOrigin().x} y:${this.model.GetAbsOrigin().y} z:${this.model.GetAbsOrigin().z}`);
            //Instance.Msg(`x:${this.breakable.GetAbsOrigin().x} y:${this.breakable.GetAbsOrigin().y} z:${this.breakable.GetAbsOrigin().z}`);
            //Instance.Msg(`x:${this.train.train?.GetAbsOrigin().x} y:${this.train.train?.GetAbsOrigin().y} z:${this.train.train?.GetAbsOrigin().z}`);
            //Instance.Msg(`===================================`);
            var ang=this.train.startTrain(monsterPos,targetPos);
            if(ang)this.model.Teleport({ angles:ang });
        } else {
            this.train.stopTrain();
            const angles = this.calculateAnglesToTarget(targetPos);
            this.train.train?.Teleport({position:this.train.Path1?.GetAbsOrigin(),angles:angles });
            
            // 在攻击范围内，停止移动
            //this.breakable.Teleport({angles:angles,velocity: { x: 0, y: 0, z: 0 } });
        }
    }

    /**
     * 尝试攻击
     */
    tryAttack() {
        if (!this.target || !this.target.IsValid()) return;

        const currentTime = Instance.GetGameTime();
        if (currentTime - this.lastAttackTime < this.attackCooldown) return;

        const monsterPos = this.breakable.GetAbsOrigin();
        const targetPos = this.target.GetAbsOrigin();
        const distance = this.calculateDistance(monsterPos, targetPos);

        if (distance <= this.attackRange) {
            this.attack();
            this.lastAttackTime = currentTime;
        }
    }

    /**
     * 执行攻击
     */
    attack() {
        if (!this.target || !this.target.IsValid()) return;

        // 检查视线是否被阻挡
        const traceResult = Instance.TraceLine({
            start: this.breakable.GetAbsOrigin(),
            end: this.target.GetAbsOrigin(),
            ignoreEntity: this.breakable
        });

        if (traceResult.didHit && traceResult.hitEntity === this.target) {
            // 对目标造成伤害
            const damageResult = this.target.TakeDamage({
                damage: this.attackDamage,
                inflictor: this.breakable,
                attacker: this.breakable
            });

            Instance.Msg(`怪物 ${this.monsterType} 对玩家造成 ${this.attackDamage} 点伤害`);
            
            // 显示攻击效果
            this.showAttackEffect();
        }
    }

    /**
     * 显示攻击效果
     */
    showAttackEffect() {
        if (!this.target) return;
        //播放动画

    
        const startPos = this.breakable.GetAbsOrigin();
        const endPos = this.target.GetAbsOrigin();

        // 绘制攻击线（开发环境）
        Instance.DebugLine({
            start: startPos,
            end: endPos,
            duration: 0.5,
            color: { r: 255, g: 0, b: 0, a: 255 }
        });
    }

    /**
     * 受到伤害
     */
    /**
     * @param {number} damage
     * @param {import("cs_script/point_script").CSPlayerPawn} attacker
     */
    takeDamage(damage, attacker) {
        if (!this.isAlive) return;

        this.health = Math.max(0, this.health - damage);
        var ls=players_map.get(attacker.GetPlayerController()?.GetPlayerSlot());
        var f=(this.health/this.maxHealth)*100;
        ls.healthhud.sethealth(f);
        ls.healthhud.show();
        ls.healthhud.teleport2(attacker.GetEyePosition(),attacker.GetEyeAngles(),this.model.GetAbsOrigin())
        Instance.Msg(`怪物 ${this.monsterType} 受到 ${damage} 点伤害，剩余生命: ${this.health}`);

        // 显示受伤效果
        this.showDamageEffect();

        if (this.health <= 0) {
            this.die(attacker);
        } //else {
            // 受伤后可能逃跑或更激进
            //this.onHurt(attacker);
        //}
    }

    /**
     * 显示受伤效果
     */
    showDamageEffect() {
        // 短暂改变颜色表示受伤
        //this.entity.SetColor({ r: 255, g: 100, b: 100, a: 255 });
        //
        //// 0.2秒后恢复颜色
        //setTimeout(() => {
            //if (this.entity && this.entity.IsValid()) {
            //    this.entity.SetColor({ r: 255, g: 255, b: 255, a: 255 });
           //}
        //}, 200);
    }

    /**
     * 受伤后的行为
     */
/*
    onHurt(attacker) {
        // 30%几率在受伤后逃跑
        if (Math.random() < 0.3) {
            this.target = null; // 清除目标
            // 可以添加逃跑逻辑
        } else if (attacker) {
            // 否则锁定攻击者为目标
            this.target = attacker;
        }
    }
*/
    /**
     * 死亡处理
     */
    /**
     * @param {import("cs_script/point_script").CSPlayerPawn} killer
     */
    die(killer) {
        if (!this.isAlive) return;

        this.isAlive = false;
        
        Instance.Msg(`怪物 ${this.monsterType} 被击杀`);

        // 播放死亡动画或效果
        this.playDeathAnimation();

        // 掉落物品
        this.dropLoot(killer);
        this.remove();
    }

    /**
     * 播放死亡动画
     */
    playDeathAnimation() {
        // 这里可以触发实体的死亡动画
        // 例如改变模型或播放声音
        //this.entity.SetColor({ r: 100, g: 100, b: 100, a: 255 }); // 变成灰色
        this.train.stopTrain();
        // 停止移动
        //this.breakable.Teleport({ velocity: { x: 0, y: 0, z: 0 } });
    }

    /**
     * 掉落物品
     */
    /**
     * @param {import("cs_script/point_script").CSPlayerPawn} killer
     */
    dropLoot(killer) {
        // 简单的掉落系统
        const lootChance = Math.random();
        
        if (lootChance < 0.3) {
            // 30%几率掉落生命值
            this.spawnHealthPack();
        } else if (lootChance < 0.5) {
            // 20%几率掉落弹药
            this.spawnAmmoPack();
        }
        
        // 给击杀者奖励
        if (killer && killer.GetClassName().includes("PlayerController")) {
            this.killer=killer;
        }
    }

    /**
     * 生成生命包
     */
    spawnHealthPack() {
        const position = this.breakable.GetAbsOrigin();
        position.z += 20; // 稍微抬高
        
        // 这里需要实现生成生命值实体的逻辑
        Instance.Msg(`怪物掉落生命包`);
    }

    /**
     * 生成弹药包
     */
    spawnAmmoPack() {
        const position = this.breakable.GetAbsOrigin();
        position.z += 20;
        
        // 这里需要实现生成弹药实体的逻辑
        Instance.Msg(`怪物掉落弹药包`);
    }

    /**
     * 计算距离
     */
    /**
     * @param {import("cs_script/point_script").Vector} pos1
     * @param {import("cs_script/point_script").Vector} pos2
     * @returns number
     */
    calculateDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * 计算方向向量
     */
    /**
     * @param {import("cs_script/point_script").Vector} from
     * @param {import("cs_script/point_script").Vector} to
     * @returns {import("cs_script/point_script").Vector}
     */
    calculateDirection(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        return {
            x: dx / length,
            y: dy / length,
            z: dz / length
        };
    }

    /**
     * 计算朝向目标的角度
     */
    /**
     * @param {import("cs_script/point_script").Vector} targetPos
     * @returns {import("cs_script/point_script").QAngle}
     */
    calculateAnglesToTarget(targetPos) {
        const monsterPos = this.model.GetAbsOrigin();
        const dx = targetPos.x - monsterPos.x;
        const dy = targetPos.y - monsterPos.y;
        
        const yaw = Math.atan2(dy, dx) * (180 / Math.PI);
        
        return {
            pitch: 0,
            yaw: yaw,
            roll: 0
        };
    }

    /**
     * 获取怪物状态
     */
    getStatus() {
        return {
            type: this.monsterType,
            health: this.health,
            maxHealth: this.maxHealth,
            isAlive: this.isAlive,
            killer: this.killer,
            hasTarget: this.target !== null
        };
    }

    /**
     * 移除怪物
     */
    remove() {
        this.isAlive = false;
        this.train.remove();
        if (this.breakable && this.breakable.IsValid()) {
            this.breakable.Remove();
        }
        if (this.model && this.model.IsValid()) {
            this.model.Remove();
        }
        if (this.breakable && this.breakable.IsValid()) {
            this.breakable.Remove();
        }
    }
}