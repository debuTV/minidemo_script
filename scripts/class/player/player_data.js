import {CSPlayerController, CSPlayerPawn, Entity, Instance} from "cs_script/point_script";
//import {hud} from "./hud";
//import {env_hudhint} from "./env_hudhint";

export class player_data
{
    /**
     * @param {number} playerSlot
     */
    constructor(playerSlot) {
        this.id = 0; // 玩家唯一ID
        this.slot = playerSlot; // 玩家槽位
        this.controller = null; // 玩家控制器
        this.pawn = null; // 玩家实体
        
        // 游戏数据
        this.money = 0;
        this.exp = 0;
        this.level = 0;
        this.maxhealth = 100;
        this.armor = 0;
        this.health = 100;
        this.score = 0;
        this.kills = 0;
        
        // 状态标志
        this.isReady = false;
        this.isAlive = false;
        this.isConnected = false;
        this.isInGame = false;
        
        // 游戏进度
        this.waveProgress = 0;
        this.damageDealt = 0;
        this.headshots = 0;
        
        // 商店相关
        //this.upgrades = new Map(); // 升级项
        //this.equippedItems = []; // 装备物品
        // 事件回调
        this.onDeath = null;
    }
    // 更新玩家实体引用
    /**
     * @param {CSPlayerController} controller
     * @param {CSPlayerPawn} pawn
     */
    updateEntityReferences(controller, pawn) {
        if (controller) {
            this.controller = controller;
        }
        if (pawn) {
            this.pawn = pawn;
        }
    }
    openshop()
    {

    }
    // 增加金钱
    /**
     * @param {number} amount
     */
    addMoney(amount) {
        this.money += Math.max(0, amount);
        return this.money;
    }
    
    // 扣除金钱
    /**
     * @param {number} amount
     */
    deductMoney(amount) {
        if (this.money >= amount) {
            this.money -= amount;
            return true;
        }
        return false;
    }
    
    // 增加经验
    /**
     * @param {number} amount
     */
    addExp(amount) {
        this.exp += Math.max(0, amount);
        this.checkLevelUp();
        return this.exp;
    }
    
    // 检查升级
    checkLevelUp() {
        const expNeeded = 100 + (this.level * 50);
        if (this.exp >= expNeeded) {
            this.level++;
            this.exp -= expNeeded;
            return true;
        }
        return false;
    }
    // 治疗玩家
    /**
     * @param {number} amount
     */
    heal(amount) {
        if (!this.isAlive || !this.pawn || !this.pawn.IsValid()) return false;
        
        const newHealth = Math.min(this.health + amount, this.maxhealth);
        const actualHeal = newHealth - this.health;
        
        if (actualHeal > 0) {
            // 更新脚本记录
            this.health = newHealth;
            // 更新游戏实体
            this.pawn.SetHealth(this.health);
            
            // 可以添加治疗特效
            this.createHealEffect(actualHeal);
            
            return true;
        }
        return true;
    }
    
    // 给予护甲
    /**
     * @param {number} amount
     */
    giveArmor(amount) {
        if (!this.isAlive || !this.pawn || !this.pawn.IsValid()) return false;
        
        const newArmor = Math.min(this.armor + amount, 100);
        const actualArmor = newArmor - this.armor;
        
        if (actualArmor > 0) {
            // 更新脚本记录
            this.armor = newArmor;
            // 更新游戏实体
            this.pawn.SetArmor(this.armor);
            
            // 可以添加护甲获得特效
            this.createArmorEffect(actualArmor);
            
            return true;
        }
        return false;
    }
    // 复活玩家
    respawn(health = 100, armor = 0) {
        if (!this.controller || !this.controller.IsValid()) return false;
        try {
            // 确保pawn存在且有效
            if (!this.pawn || !this.pawn.IsValid()) {
                // 尝试重新获取pawn
                this.pawn = this.controller.GetPlayerPawn();
                if (!this.pawn || !this.pawn.IsValid()) {
                    return false; // 需要等待重生完成
                }
            }
            
            // 设置生命值和护甲
            this.health = Math.max(0, Math.min(health, this.maxhealth));
            this.isAlive = true;
            
            // 确保玩家处于活动状态
            this.controller.JoinTeam(3);
            
            // 更新游戏实体
            this.pawn.SetHealth(this.health);
            this.pawn.SetMaxHealth(this.maxhealth);

            this.giveArmor(Math.max(0, Math.min(armor, 100)));
            // 给予基础装备
            this.giveBaseEquipment();
            
            // 重生特效
            this.createRespawnEffect();
            
            Instance.Msg(`玩家 ${this.controller.GetPlayerName()} 已复活 (HP: ${this.health}, 护甲: ${this.armor})`);
            
            return true;
        } catch (error) {
            Instance.Msg(`复活玩家 ${this.controller?.GetPlayerName()} 失败: ${error}`);
            return false;
        }
    }
    // 受到怪物伤害
    /**
     * @param {number} damage
     * @param {Entity|null|undefined} attacker
     * @param {Entity|null|undefined} inflictor
    */
    takeDamage(damage,attacker,inflictor) {
        if (!this.isAlive || !this.pawn || !this.pawn.IsValid()) return false;
        
        // 更新脚本记录
        this.armor = this.pawn.GetArmor();
        this.health = this.pawn.GetHealth();
      
        // 如果生命值归零，标记死亡
        if (this.health <= 0) {
            this.isAlive = false;
            
            // 触发死亡事件（如果有回调的话）
            if (this.onDeath) {
                this.onDeath(this, attacker);
            }

            // 如果死亡，设置玩家为观察者模式
            if (this.controller && this.controller.IsValid()) {
                // 这里可以添加死亡后的观察逻辑
                this.controller.JoinTeam(1);
            }
            
            Instance.Msg(`玩家 ${this.controller?.GetPlayerName()} 死亡 (受到 ${damage} 伤害)`);
            return true; // 死亡
        } else {
            Instance.Msg(`玩家 ${this.controller?.GetPlayerName()} 受到 ${damage} 伤害 (生命: ${this.health}, 护甲: ${this.armor})`);
            return false; // 存活
        }
    }
    /**
     * 创建治疗特效
     * @param {number} healAmount
     */
    createHealEffect(healAmount) {
        if (!this.pawn || !this.pawn.IsValid()) return;
        
        // 在玩家位置创建治疗粒子效果
        Instance.EntFireAtName({
            name: "heal_particle_template", // 假设有一个治疗粒子模板
            input: "ForceSpawn",
            activator: this.pawn
        });
        
        // 播放治疗音效
        Instance.EntFireAtTarget({
            target: this.pawn,
            input: "PlaySound",
            value: "UI/Beep07.wav"
        });
        
        // 屏幕效果（绿色闪烁）
        Instance.ClientCommand(this.slot, "r_screenoverlay effects/heal_screen.vtf");
    }

    /**
     * 创建护甲获得特效
     * @param {number} armorAmount
     */
    createArmorEffect(armorAmount) {
        if (!this.pawn || !this.pawn.IsValid()) return;
        
        // 护甲粒子效果
        Instance.EntFireAtName({
            name: "armor_particle_template", // 假设有一个护甲粒子模板
            input: "ForceSpawn",
            activator: this.pawn
        });
        
        // 播放护甲音效
        Instance.EntFireAtTarget({
            target: this.pawn,
            input: "PlaySound",
            value: "items/itempickup.wav"
        });
    }

    /**
     * 创建重生特效
     */
    createRespawnEffect() {
        if (!this.pawn || !this.pawn.IsValid()) return;
        
        // 重生粒子效果
        Instance.EntFireAtName({
            name: "respawn_particle_template",
            input: "ForceSpawn",
            activator: this.pawn
        });
        
        // 重生音效
        Instance.EntFireAtTarget({
            target: this.pawn,
            input: "PlaySound",
            value: "ambient/atmosphere/cave_hit5.wav"
        });
    }
    /**
     * 给予基础装备
     */
    giveBaseEquipment() {
        if (!this.pawn || !this.pawn.IsValid()) return;
        
        // 清除现有武器
        this.pawn.DestroyWeapons();
        
        // 给予基础武器
        this.pawn.GiveNamedItem("weapon_knife", true);
        this.pawn.GiveNamedItem("weapon_glock", true);

    }
    // 7. 设置死亡回调的方法
    /**
     * @param {(playerData: player_data, killer: Entity|null|undefined) => void} callback
     */
    setOnDeath(callback) {
        this.onDeath = callback;
    }
    // 获取玩家信息摘要
    getSummary() {
        return {
            id: this.id,
            name: this.controller ? this.controller.GetPlayerName() : "Unknown",
            slot: this.slot,
            level: this.level,
            money: this.money,
            health: this.health,
            armor: this.armor,
            kills: this.kills,
            score: this.score,
            isReady: this.isReady,
            isAlive: this.isAlive
        };
    }
}