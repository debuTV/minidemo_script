import { Instance, CSPlayerPawn, Entity } from "cs_script/point_script";
import { Monster_Zombie_Model } from "./monster_zombie_model";
import { MonsterManager } from "./monster_manager";
export class Monster {
    /**
     * @param {MonsterManager} mm
     * @param {number} id
     * @param {import("cs_script/point_script").Vector} position
     * @param {{name: string, baseHealth: number, baseDamage: number, speed: number, reward: number}} typeConfig
     * @param {{name:string,totalMonsters:number,reward:number,spawnInterval:number,preparationTime:number,monsterTypes:{name: string, baseHealth: number, baseDamage: number, speed: number, reward: number}[]}} waveConfig
     */
    constructor(mm,id, position, typeConfig, waveConfig) {
        /** @type {MonsterManager} */
        this.mm=mm;
        /** @type {number} */
        this.id = id;
        this.type = typeConfig.name || "Zombie";
        /** @type {number} */
        this.health = typeConfig.baseHealth || 100;
        /** @type {number} */
        this.maxHealth = this.health;
        /** @type {number} */
        this.damage = typeConfig.baseDamage || 10;
        /** @type {number} */
        this.speed = typeConfig.speed || 250;
        /** @type {number} */
        this.baseReward = typeConfig.reward || 100;
        /** @type {{name:string,totalMonsters:number,reward:number,spawnInterval:number,preparationTime:number,monsterTypes:{name: string, baseHealth: number, baseDamage: number, speed: number, reward: number}[]}} */
        this.wave = waveConfig;
        /** @type {boolean} */
        this.isAlive = true;
        
        // 实体控制委托给 monster_model
        //按照this.type选择，目前只有ZOMBIE
        /** @type {Monster_Zombie_Model} */
        this.model = new Monster_Zombie_Model(this.mm,id, position, typeConfig,this.health);
        this.model.setOnDamage((amount, attacker) => {
            // 通知WaveManager波次完成
            const damage=this.health-this.maxHealth*amount;
            this.takeDamage(damage, attacker);
        });


        // 状态管理
        /** @type {CSPlayerPawn|null} */
        this.targetPlayer = null;
        /** @type {number} */
        this.lastTargetUpdate = 0;
        /** @type {number} */
        this.attackCooldown = 0;
        this.onDeath = null;
        
        Instance.Msg(`怪物 #${this.id} 创建: ${this.type} (HP: ${this.health})`);
    }
    // 获取ID
    getId() {
        return this.id;
    }
    
    // 获取类型
    getType() {
        return this.type;
    }
    
    // 获取生命值
    getHealth() {
        return this.health;
    }
    // 获取奖励
    getReward() {
        return this.baseReward;
    }
    // 受到伤害
    /**
     * @param {number} amount
     * @param {CSPlayerPawn | null} attacker
     */
    takeDamage(amount, attacker) {
        if (!this.isAlive) return false;
        
        const previousHealth = this.health;
        this.health -= amount;
        
        Instance.Msg(`怪物 #${this.id} 受到 ${amount} 点伤害 (${previousHealth} -> ${this.health})`);
        
        if (this.health <= 0) {
            this.die(attacker);
            return true; // 死亡
        }
        
        // 如果没有目标或受到玩家伤害，设置攻击者为目标
        if (attacker && attacker.GetClassName && attacker.GetClassName().includes("player")) {
            this.targetPlayer = attacker;
        }
        
        return false; // 存活
    }
    // 死亡
    /**
     * @param {CSPlayerPawn | null} killer
     */
    die(killer) {
        if (!this.isAlive) return;
        
        this.isAlive = false;
        
        // 播放死亡效果
        if (this.model.onDeath) {
            this.model.onDeath(killer);
        }
        
        // 触发死亡回调
        if (this.onDeath) {
            this.onDeath(this, killer);
        }
        
        // 清理模型
        this.model.remove();
        
        Instance.Msg(`怪物 #${this.id} 死亡`);
    }
    // 强制杀死
    kill() {
        this.die(null);
    }
    
    // 清理
    remove() {
        if (this.isAlive) {
            this.die(null);
        } else {
            this.model.remove();
        }
    }
    // 设置死亡回调
    /**
     * @param {(monsterInstance: Monster, killer: null|CSPlayerPawn) => void} callback
     */
    setOnDeath(callback) {
        this.onDeath = callback;
    }
    // 怪物主更新循环
    /**
     * @param {number} nowtime
     */
    tick(nowtime) {
        if (!this.isAlive) return;
        
        const currentTime = Instance.GetGameTime();
        
        // 更新目标
        if (currentTime - this.lastTargetUpdate > 2.0) {
            this.updateTarget();
            this.lastTargetUpdate = currentTime;
        }
        
        // 移动（委托给model）
        this.move();
        
        // 攻击冷却
        if (this.attackCooldown > 0) {
            this.attackCooldown -= 1/16;
        }
        
        // 攻击检查
        this.checkAttack();
    }
    // 更新目标
    updateTarget() {
        const players = Instance.FindEntitiesByClass("player");
        let closestPlayer = null;
        let closestDistance = Infinity;
        
        for (const player of players) {
            if (player && player instanceof CSPlayerPawn && player.IsAlive()) {
                const distance = this.getDistanceTo(player);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPlayer = player;
                }
            }
        }
        
        this.targetPlayer = closestPlayer;
    }
    // 获取到目标的距离
    /**
     * @param {CSPlayerPawn} target
     */
    getDistanceTo(target) {
        const monsterPos = this.model.getPosition();
        const targetPos = target.GetAbsOrigin();
        
        const dx = targetPos.x - monsterPos.x;
        const dy = targetPos.y - monsterPos.y;
        const dz = targetPos.z - monsterPos.z;
        
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }
    // 移动 - 委托给monster_model
    move() {
        if (!this.isAlive || !this.targetPlayer) return;
        
        const targetPos = this.targetPlayer.GetAbsOrigin();
        
        // 委托移动逻辑给model
        if (this.model.moveTo) {
            this.model.moveTo(targetPos);
        }
    }
    
    // 检查攻击
    checkAttack() {
        if (!this.targetPlayer || this.attackCooldown > 0) return;
        
        const distance = this.getDistanceTo(this.targetPlayer);
        const attackRange = 50;/////////////攻击距离
        
        if (distance <= attackRange) {
            this.attack(this.targetPlayer);
            this.attackCooldown = 1.0;
        }
    }
    // 攻击玩家
    /**
     * @param {CSPlayerPawn} player
     */
    attack(player) {
        if (!player || !player.IsAlive()) return;
        
        Instance.Msg(`怪物 #${this.id} 攻击玩家 ${player.GetPlayerController()?.GetPlayerName()}`);
        
        // 对玩家造成伤害
        //player.TakeDamage({
        //    damage: this.damage,
        //    attacker: this.model.getEntity() || undefined,
        //    inflictor: this.model.getEntity() || undefined
        //});

        // 击退或者击飞玩家
        const a=this.model.getPosition();
        const b=player.GetAbsOrigin();
        const l=300/Math.sqrt((b.x-a.x)*(b.x-a.x)+(b.y-a.y)*(b.y-a.y));
        player.Teleport({velocity:{x:(b.x-a.x)*l,y:(b.y-a.y)*l,z:150}});
        // 给玩家播放音效
        // 播放攻击效果
        if (this.model.onAttack) {
            this.model.onAttack();
        }
    }
    // 获取怪物信息
    getInfo() {
        return {
            id: this.id,
            type: this.type,
            health: this.health,
            maxHealth: this.maxHealth,
            alive: this.isAlive,
            hasTarget: this.targetPlayer ? true : false
        };
    }
    // 获取怪物位置（从model获取）
    getPosition() {
        return this.model.getPosition();
    }
    
    // 获取怪物实体（从model获取）
    getEntity() {
        return this.model.getEntity();
    }
}