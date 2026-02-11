import {CSPlayerController, CSPlayerPawn, Instance, PointTemplate} from "cs_script/point_script";
//import {hud} from "./hud";
//import {env_hudhint} from "./env_hudhint";
import { player_data } from "./player/player_data";

export class PlayerManager
{
    constructor() {
        /** @type {Map<number,player_data>} */
        this.players = new Map(); // slot -> player_data
        /** @type {number} */
        this.nextPlayerId = 1; // 下一个玩家ID
        /** @type {number} */
        this.totalPlayers = 0; // 总玩家数
        /** @type {number} */
        this.readyCount = 0; // 准备玩家数
        
        // 事件回调
        this.onPlayerJoin = null;
        this.onPlayerLeave = null;
        this.onPlayerReady = null;
        this.onPlayerDeath = null;
        this.onPlayerRespawn = null;
        this.onPlayerMoneyChange = null;
        this.onPlayerLevelUp = null;
    }
    setupEventListeners() {
        //将在脚本加载前的玩家加入到data内
        const players = Instance.FindEntitiesByClass("player");
        for (const player of players) {
            if (player && player instanceof CSPlayerPawn) {
                const controller=player.GetPlayerController();
                this.handlePlayerConnect(controller);
                if(player.IsAlive()){
                    this.handlePlayerActivate(controller);
                }
            }
        }
        // 监听玩家连接
        Instance.OnPlayerConnect((event) => {
            //Instance.Msg("玩家连接");
            this.handlePlayerConnect(event.player);
        });
        
        // 监听玩家激活
        Instance.OnPlayerActivate((event) => {
            //Instance.Msg("玩家激活");
            this.handlePlayerActivate(event.player);
        });
        
        // 监听玩家断开
        Instance.OnPlayerDisconnect((event) => {
            //Instance.Msg("玩家断开");
            this.handlePlayerDisconnect(event.playerSlot);
        });
        
        // 监听玩家重置（重生/换队）
        Instance.OnPlayerReset((event) => {
            Instance.Msg("玩家重置");
            this.handlePlayerReset(event.player);
        });
        
        // 监听玩家死亡
        Instance.OnPlayerKill((event) => {
            //Instance.Msg("玩家死亡");
            this.handlePlayerDeath(event.player);
        });
        
        // 监听玩家聊天
        Instance.OnPlayerChat((event) => {
            //Instance.Msg("玩家聊天");
            this.handlePlayerChat(event.player, event.text);
        });
        
        // 监听伤害事件，从高处落下触发1和2,takeDamage触发1和2
        Instance.OnBeforePlayerDamage((event) => {
            Instance.Msg("玩家伤害1");
            this.handleBeforePlayerDamage(event);
        });
        
        //pawn.SetHealth只触发2
        Instance.OnPlayerDamage((event) => {
            Instance.Msg("玩家伤害2");
            this.handlePlayerDamage(event);
        });
        Instance.OnScriptInput("shop",(e)=>{
            const player=e.activator;
            if (player && player instanceof CSPlayerController) {
                this.players.get(player.GetPlayerSlot())?.openshop();
            }
        });
    }
    // 处理玩家连接
    /**
     * @param {CSPlayerController|undefined} controller
     */
    handlePlayerConnect(controller) {
        if (!controller) return;
        
        const playerSlot = controller.GetPlayerSlot();

        // 创建玩家数据
        const playerData = new player_data(playerSlot);
        playerData.id = this.nextPlayerId++;
        playerData.controller = controller;
        playerData.isConnected = true;
        
        // 存储玩家数据
        this.players.set(playerSlot, playerData);
        this.totalPlayers++;
        
        Instance.Msg(`玩家 ${controller.GetPlayerName()} 加入游戏 (ID: ${playerData.id})`);
        
        // 触发回调
        if (this.onPlayerJoin) {
            this.onPlayerJoin(playerData);
        }
        
        // 发送欢迎消息
        this.sendWelcomeMessage(playerSlot);
    }
    
    // 处理玩家激活
    /**
     * @param {CSPlayerController|undefined} controller
     */
    handlePlayerActivate(controller) {
        if (!controller) return;
        
        const playerSlot = controller.GetPlayerSlot();
        const playerData = this.players.get(playerSlot);
        
        if (playerData) {
            playerData.pawn = controller.GetPlayerPawn();
            playerData.isInGame = true;
            playerData.isAlive = true;

            // 初始化玩家游戏内状态
            this.initializePlayer(playerData);
            
            Instance.Msg(`玩家 ${controller.GetPlayerName()} 已激活`);
        }
    }
    
    // 处理玩家断开
    /**
     * @param {number} playerSlot
     */
    handlePlayerDisconnect(playerSlot) {
        const playerData = this.players.get(playerSlot);
        
        if (playerData) {
            Instance.Msg(`玩家 ${playerData.controller?.GetPlayerName() || "Unknown"} 离开游戏`);
            
            // 移除准备状态
            if (playerData.isReady) {
                this.readyCount--;
            }
            
            // 触发回调
            if (this.onPlayerLeave) {
                this.onPlayerLeave(playerData);
            }
            
            // 从管理器中移除
            this.players.delete(playerSlot);
            this.totalPlayers--;
        }
    }
    
    // 处理玩家重置
    /**
     * @param {CSPlayerPawn} pawn
     */
    handlePlayerReset(pawn) {
        if (!pawn) return;
        
        const playerData = this.getPlayerByPawn(pawn);

        if (playerData) {
            // 玩家重生，更新状态
            playerData.pawn = pawn;
            playerData.isAlive = true;
            const oldHealth = playerData.health;
            // 模拟受到伤害
            if (playerData.pawn && playerData.pawn.IsValid()) {
                Instance.Msg(playerData.health);
                Instance.Msg(Math.max(0, oldHealth - 0));
                playerData.pawn.SetHealth(Math.max(0, oldHealth - 0));
                playerData.takeDamage(0,null,null); // 更新脚本记录
                if (playerData.health <= 0) {
                    playerData.isAlive = false;
                }
            }
            // 触发重生回调
            if (this.onPlayerRespawn) {
                this.onPlayerRespawn(playerData);
            }
        }
        else
        {
            this.handlePlayerConnect(pawn.GetPlayerController());
            this.handlePlayerActivate(pawn.GetPlayerController());
        }
    }
    
    // 处理玩家死亡
    /**
     * @param {CSPlayerPawn} playerPawn
     */
    handlePlayerDeath(playerPawn) {
        const playerData = this.getPlayerByPawn(playerPawn);
        
        if (playerData) {
            playerData.isAlive = false;
            
            // 触发死亡回调
            if (this.onPlayerDeath) {
                this.onPlayerDeath(playerPawn);
            }
        }
    }
    
    // 处理玩家聊天
    /**
     * @param {CSPlayerController|undefined} controller
     * @param {string} text
     */
    handlePlayerChat(controller, text) {
        if (!controller) return;
        const playerData = this.getPlayerByController(controller);
        if (!playerData) return;
        const command = text.trim().toLowerCase();
        // 处理准备命令
        if (command === "!r" || command === "!ready") {
            this.setPlayerReady(playerData.slot, true);
        }
        
        // 处理取消准备
        if (command === "!ur" || command === "!unready") {
            this.setPlayerReady(playerData.slot, false);
        }
        
        // 处理金钱命令
        if (command === "!money" || command === "!cash") {
            this.sendPlayerMoney(playerData.slot);
        }
        
        // 处理状态命令
        if (command === "!stats" || command === "!status") {
            this.sendPlayerStats(playerData.slot);
        }
        // ========== 添加测试命令 ==========
    
        // 测试命令：显示玩家所有数据
        if (command === "!test_data") {
            const summary = playerData.getSummary();
            this.sendMessage(playerData.slot, `=== 玩家数据测试 ===`);
            this.sendMessage(playerData.slot, `ID: ${summary.id}, 名称: ${summary.name}`);
            this.sendMessage(playerData.slot, `等级: ${summary.level}, 金钱: $${summary.money}`);
            this.sendMessage(playerData.slot, `生命: ${summary.health}/${playerData.maxhealth}, 护甲: ${summary.armor}`);
            this.sendMessage(playerData.slot, `击杀: ${summary.kills}, 分数: ${summary.score}`);
            this.sendMessage(playerData.slot, `准备: ${summary.isReady ? '是' : '否'}, 存活: ${summary.isAlive ? '是' : '否'}`);
            return;
        }
        // 测试命令：复活玩家
        if (command === "!test_respawn") {
            if (!playerData.isAlive) {
                const respawned = playerData.respawn(100, 50);
                if (respawned) {
                    this.sendMessage(playerData.slot, `测试: 玩家已复活 (HP: 100, 护甲: 50)`);
                } else {
                    this.sendMessage(playerData.slot, `测试: 复活失败`);
                }
            } else {
                this.sendMessage(playerData.slot, `测试: 玩家已存活，无需复活`);
            }
            return;
        }
        
        // 测试命令：模拟受到伤害
        if (command.startsWith("!test_damage ")) {
            const amount = parseInt(command.split(" ")[1]);
            if (!isNaN(amount)) {
                const oldHealth = playerData.health;
                // 模拟受到伤害
                if (playerData.pawn && playerData.pawn.IsValid()) {
                    playerData.pawn.SetHealth(Math.max(0, oldHealth - amount));
                    playerData.takeDamage(amount,null,null); // 更新脚本记录
                    this.sendMessage(playerData.slot, `测试: 受到伤害 ${oldHealth} -> ${playerData.health} (-${amount})`);
                    if (playerData.health <= 0) {
                        this.sendMessage(playerData.slot, `测试: 玩家已死亡`);
                        playerData.isAlive = false;
                    }
                } else {
                    this.sendMessage(playerData.slot, `测试: 玩家实体无效`);
                }
            }
            return;
        }
        
        // 测试命令：显示玩家管理器状态
        if (command === "!test_pmstatus") {
            const status = this.getStatus();
            const stats = this.getPlayerStats();
            this.sendMessage(playerData.slot, `=== 玩家管理器状态 ===`);
            this.sendMessage(playerData.slot, `总玩家: ${status.totalPlayers}, 准备: ${status.readyCount}`);
            this.sendMessage(playerData.slot, `活跃: ${stats.active}, 存活: ${stats.alive}`);
            this.sendMessage(playerData.slot, `下一个玩家ID: ${status.nextPlayerId}`);
            return;
        }
    }
    //重置所有玩家数据
    resetPlayerGameStatus()
    {
        for (const [slot, playerData] of this.players) {
            playerData.health = 100;
            playerData.maxhealth = 100;
            playerData.armor = 100;
            playerData.isAlive = true;

            this.giveStartingEquipment(playerData);
        }
    }
    // 初始化玩家
    /**
     * @param {player_data} playerData
     */
    initializePlayer(playerData) {
        // 重置玩家游戏数据
        playerData.health = 100;
        playerData.maxhealth = 100;
        playerData.armor = 0;
        playerData.isAlive = true;
        playerData.isReady = false;
        
        // 给予初始装备
        this.giveStartingEquipment(playerData);
        
        // 发送游戏说明
        this.sendGameInstructions(playerData.slot);
    }
    // 给予初始装备
    /**
     * @param {player_data} playerData
     */
    giveStartingEquipment(playerData) {
        if (playerData.pawn) {
            // 给予初始武器
            playerData.pawn.GiveNamedItem("weapon_knife", true);
            playerData.pawn.GiveNamedItem("weapon_glock", true);
            
            // 给予初始金钱
            playerData.money = 800;
        }
    }
    // 设置玩家准备状态
    /**
     * @param {number} playerSlot
     * @param {boolean} isReady
     */
    setPlayerReady(playerSlot, isReady) {
        const playerData = this.players.get(playerSlot);
        if (!playerData || playerData.isReady === isReady) return false;
        
        playerData.isReady = isReady;
        
        // 更新准备计数
        if (isReady) {
            this.readyCount++;
        } else {
            this.readyCount--;
        }
        
        // 广播准备状态
        const playerName = playerData.controller?.GetPlayerName() || "玩家";
        if (isReady) {
            this.broadcastMessage(`${playerName} 已准备 (${this.readyCount}/${this.totalPlayers})`);
        } else {
            this.broadcastMessage(`${playerName} 取消准备 (${this.readyCount}/${this.totalPlayers})`);
        }
        
        // 触发回调
        if (this.onPlayerReady) {
            this.onPlayerReady(playerData, isReady);
        }
        
        return true;
    }
    
    // 重置所有玩家准备状态
    resetAllReadyStatus() {
        let resetCount = 0;
        
        for (const [slot, playerData] of this.players) {
            if (playerData.isReady) {
                playerData.isReady = false;
                resetCount++;
            }
        }
        
        this.readyCount = 0;
        return resetCount;
    }
    // 给予玩家金钱
    /**
     * @param {number} playerSlot
     * @param {number} amount
     */
    giveMoney(playerSlot, amount, reason = "") {
        const playerData = this.players.get(playerSlot);
        if (!playerData) return false;
        
        const oldMoney = playerData.money;
        playerData.addMoney(amount);
        
        // 通知玩家
        this.sendMessage(playerSlot, `获得 $${amount} ${reason}`);
        
        // 触发回调
        if (this.onPlayerMoneyChange) {
            this.onPlayerMoneyChange(playerData, oldMoney, playerData.money);
        }
        
        return true;
    }
    
    // 给予玩家经验
    /**
     * @param {number} playerSlot
     * @param {number} amount
     */
    giveExp(playerSlot, amount, reason = "") {
        const playerData = this.players.get(playerSlot);
        if (!playerData) return false;
        
        const oldLevel = playerData.level;
        playerData.addExp(amount);
        
        // 检查是否升级
        if (playerData.level > oldLevel) {
            this.sendMessage(playerSlot, `恭喜升级到 ${playerData.level} 级！`);
            
            // 触发升级回调
            if (this.onPlayerLevelUp) {
                this.onPlayerLevelUp(playerData, oldLevel, playerData.level);
            }
        }
        
        return true;
    }
    
    // 治疗玩家
    /**
     * @param {number} playerSlot
     * @param {number} amount
     */
    healPlayer(playerSlot, amount) {
        const playerData = this.players.get(playerSlot);
        if (!playerData) return false;
        
        return playerData.heal(amount);
    }
    
    // 复活玩家
    /**
     * @param {number} playerSlot
     */
    respawnPlayer(playerSlot, health = 100, armor = 0) {
        const playerData = this.players.get(playerSlot);
        if (!playerData) return false;
        
        return playerData.respawn(health, armor);
    }
    /**
     * @param {number} reward
     */
    giveWaveReward(reward)
    {
        for (const [slot, playerData] of this.players) {
            this.giveMoney(slot,reward);
            this.giveExp(slot,reward);
        }
    }
    // 获取玩家数据
    /**
     * @param {number} playerSlot
     */
    getPlayer(playerSlot) {
        return this.players.get(playerSlot);
    }
    
    /**
     * @param {CSPlayerController} controller
     */
    getPlayerByController(controller) {
        if (!controller) return null;
        return this.players.get(controller.GetPlayerSlot());
    }
    
    /**
     * @param {CSPlayerPawn} pawn
     */
    getPlayerByPawn(pawn) {
        if (!pawn) return null;
        
        for (const [slot, playerData] of this.players) {
            if (playerData.pawn === pawn) {
                return playerData;
            }
        }
        return null;
    }
    
    // 获取所有玩家
    getAllPlayers() {
        return Array.from(this.players.values());
    }
    
    // 获取活跃玩家（在游戏中且存活）
    getActivePlayers() {
        return Array.from(this.players.values()).filter(p => p.isInGame && p.isAlive);
    }
    
    // 获取准备玩家
    getReadyPlayers() {
        return Array.from(this.players.values()).filter(p => p.isReady);
    }
    
    // 获取存活玩家
    getAlivePlayers() {
        return Array.from(this.players.values()).filter(p => p.isAlive);
    }
    
    // 检查是否所有玩家都准备好了
    areAllPlayersReady() {
        if (this.totalPlayers === 0) return false;
        return this.readyCount === this.totalPlayers;
    }
    
    // 检查是否还有存活玩家
    hasAlivePlayers() {
        return this.getAlivePlayers().length > 0;
    }
    
    // 获取玩家数量统计
    getPlayerStats() {
        return {
            total: this.totalPlayers,
            ready: this.readyCount,
            alive: this.getAlivePlayers().length,
            active: this.getActivePlayers().length
        };
    }
    
    // 发送消息给玩家
    /**
     * @param {number} playerSlot
     * @param {string} message
     */
    sendMessage(playerSlot, message) {
        //Instance.ClientCommand(playerSlot, `say ${message}`);
        Instance.Msg(message);
    }
    
    // 发送欢迎消息
    /**
     * @param {number} playerSlot
     */
    sendWelcomeMessage(playerSlot) {
        const messages = [
            "欢迎来到PVE模式！",
            "输入 !r 准备游戏",
            "输入 !shop 打开商店",
            "输入 !stats 查看状态"
        ];
        
        messages.forEach((msg, index) => {
                this.sendMessage(playerSlot, msg);
        });
    }
    
    // 发送游戏说明
    /**
     * @param {number} playerSlot
     */
    sendGameInstructions(playerSlot) {
        const messages = [
            "目标：消灭所有怪物波次",
            "击杀怪物获得金钱和经验",
            "在商店升级武器和属性",
            "团队合作是关键！"
        ];
        
        messages.forEach((msg, index) => {
                this.sendMessage(playerSlot, msg);
        });
    }
    
    // 发送玩家金钱信息
    /**
     * @param {number} playerSlot
     */
    sendPlayerMoney(playerSlot) {
        const playerData = this.players.get(playerSlot);
        if (playerData) {
            this.sendMessage(playerSlot, `金钱: $${playerData.money}`);
        }
    }
    
    // 发送玩家状态
    /**
     * @param {number} playerSlot
     */
    sendPlayerStats(playerSlot) {
        const playerData = this.players.get(playerSlot);
        if (playerData) {
            const stats = playerData.getSummary();
            const message = 
                `ID: ${stats.id} | 等级: ${stats.level} | 金钱: $${stats.money}\n` +
                `生命: ${stats.health}/${playerData.maxhealth} | 护甲: ${stats.armor}\n` +
                `击杀: ${stats.kills} | 分数: ${stats.score}`;
            
            // 分多行发送
            message.split('\n').forEach(line => {
                this.sendMessage(playerSlot, line);
            });
        }
    }
    // 广播消息
    /**
     * @param {string} message
     */
    broadcastMessage(message) {
        //Instance.ServerCommand(`say ${message}`);
        Instance.Msg(message);
    }
    // 设置回调
    /**
     * @param {(playerData: player_data)=> void} callback
     */
    setOnPlayerJoin(callback) { this.onPlayerJoin = callback; }
    /**
     * @param {(playerData: player_data)=> void} callback
     */
    setOnPlayerLeave(callback) { this.onPlayerLeave = callback; }
    /**
     * @param {(playerData: player_data, isReady: boolean) => void} callback
     */
    setOnPlayerReady(callback) { this.onPlayerReady = callback; }
    /**
     * @param {(playerPawn: CSPlayerPawn) => void} callback
     */
    setOnPlayerDeath(callback) { this.onPlayerDeath = callback; }
    /**
     * @param {(playerData: player_data)=> void} callback
     */
    setOnPlayerRespawn(callback) { this.onPlayerRespawn = callback; }
    /**
     * @param {any} callback
     */
    setOnPlayerMoneyChange(callback) { this.onPlayerMoneyChange = callback; }
    /**
     * @param {any} callback
     */
    setOnPlayerLevelUp(callback) { this.onPlayerLevelUp = callback; }
    
    // 获取管理器状态
    getStatus() {
        return {
            totalPlayers: this.totalPlayers,
            readyCount: this.readyCount,
            nextPlayerId: this.nextPlayerId
        };
    }
    // 处理伤害前事件
    /**
     * @param {import("cs_script/point_script").BeforePlayerDamageEvent} event
     */
    handleBeforePlayerDamage(event) {
        const playerData = this.getPlayerByPawn(event.player);
        if (!playerData || !playerData.isAlive) {
            return { abort: true }; // 阻止伤害
        }
        
        // 这里可以添加伤害修改逻辑
        // 例如：根据玩家等级或装备减少伤害
        
        return null; // 不修改伤害
    }
    
    // 处理伤害事件
    /**
     * @param {import("cs_script/point_script").PlayerDamageEvent} event
     */
    handlePlayerDamage(event) {
        const playerData = this.getPlayerByPawn(event.player);
        if (playerData) {
            // 记录伤害承受
            // 注意：event.damage 是实际失去的生命值
            // 调用player_data的takeDamage方法
            const died = playerData.takeDamage(event.damage, event.attacker, event.inflictor);
            
            // 如果玩家死亡，触发死亡事件
            if (died) {
                this.handlePlayerDeath(event.player);
            }
        }
    }
    /**
     * @param {number} nowtime
     */
    tick(nowtime)
    {
        //更新玩家的信息
        //this.env_hudhint.UpdateHud();
        //更新玩家正在攻击的怪物的血条
        //this.healthhud.check(3);
        //更新商店页面
        //this.shophud.check(30);
    }
}