import { Monster } from "../monster";
import { SkillTemplate } from "../skill_manager";

export class DoubleAttackSkill extends SkillTemplate {
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