import { CSPlayerPawn, Entity, Instance, PointTemplate } from "cs_script/point_script";
import { NPCLocomotion } from "./movement/npc_locomotion";
import { MonsterAnimator } from "./animator";
import { NavMesh } from "./navmesh/path_manager";
import { SkillTemplate } from "./skill_manager";
import { SkillFactory } from "./skill_factory";

export const MonsterState = {
    IDLE: 0,//空闲
    CHASE: 1,//追人
    ATTACK: 2,//攻击
    SKILL:  3,//技能
    DEAD: 4//死亡
};
export class Monster {
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

        this.occupation = "";

        //死亡回调
        this.onDeath = null;
        this.initEntities(position,typeConfig.template_name);
        
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
        this.state=MonsterState.DEAD;
        this.emitEvent({ type: "OnDie"});
        // 触发死亡回调
        if (this.onDeath) {
            this.onDeath(this, killer);
        }
        
        // 清理模型
        this.model.Remove();
        this.breakable.Remove();
        Instance.Msg(`怪物 #${this.id} 死亡`);
    }
    // 设置死亡回调
    /**
     * @param {(monsterInstance: Monster, killer: null|CSPlayerPawn) => void} callback
     */
    setOnDeath(callback) {
        this.onDeath = callback;
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
            if (!(p instanceof CSPlayerPawn) || !p.IsAlive()) continue;
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
        this.attackCooldown = 3.0; // 攻击间隔

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
        const l = 300 / Math.hypot(b.x - a.x, b.y - a.y);
        this.emitEvent({ type: "OnattackTrue"});
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