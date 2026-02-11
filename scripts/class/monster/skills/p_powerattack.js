import { Monster } from "../monster";
import { SkillTemplate } from "../skill_manager";

export class PowerAttackSkill extends SkillTemplate {
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