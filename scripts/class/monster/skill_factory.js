import { CoreStats } from "./skills/p_corestats";
import { PounceSkill } from "./skills/a_pounce";
import { DoubleAttackSkill } from "./skills/p_doubleattack";
import { PowerAttackSkill } from "./skills/p_powerattack";
import { PoisonGasSkill } from "./skills/p_poisongas";
import { ShieldSkill } from "./skills/a_shield";
import { Monster } from "./monster";
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