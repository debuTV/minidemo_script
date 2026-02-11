import { Instance } from "cs_script/point_script";
import { Monster } from "./monster";
import { CoreStats } from "./skills/p_corestats";
import { PounceSkill } from "./skills/a_pounce";
import { DoubleAttackSkill } from "./skills/p_doubleattack";
import { PowerAttackSkill } from "./skills/p_powerattack";
import { PoisonGasSkill } from "./skills/p_poisongas";
import { ShieldSkill } from "./skills/a_shield";

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
export const SkillFactory = {
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
export class SkillTemplate
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