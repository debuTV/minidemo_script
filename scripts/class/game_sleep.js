import {Instance} from "cs_script/point_script";
export class sleep
{
    /**
     * @param {number} runtime
     */
    constructor(runtime)
    {
        this.onTime=null;
        /**@type {number} */
        this.runtime=runtime+Instance.GetGameTime();
        /**@type {boolean} */
        this.use=false;
    }
    /**
     * @param {number} nowtime
     */
    tick(nowtime)
    {
        if(nowtime>=this.runtime&&this.onTime)
        {
            this.use=true;
            this.onTime();
        }
    }
    /**
     * @param {any} callback
     */
    setonTime(callback)
    {
        this.onTime=callback;
    }
}
class sleepList
{
    constructor()
    {
        /**@type {Map<number,sleep>} */
        this.list = new Map();
        /**@type {number} */
        this.totalwork=0;
    }
    /**
     * @param {number} nowtime
     */
    tick(nowtime)
    {
        for (const [id, work] of this.list) {
            if (work.use) this.list.delete(id);
            work.tick(nowtime);
        }
    }
    /**
     * @param {sleep} work
     */
    add(work)
    {
        this.list.set(this.totalwork++,work);
    }
}
export let m_sleepList=new sleepList();

/**
 * @type {any[]}
 */
const onTicks = [];
/**
 * @type {any[]}
 */
let delayActions = [];

export function tickCallback() {
    for (const cb of onTicks) {
        cb();
    }

    delayActions = delayActions.filter(act => {
        if (act.targetTime > Instance.GetGameTime())
            return true;

        act.resolve();
        return false;
    });
}

/**
 * @param {any} callback
 */
export function scheduleTick(callback) {
    onTicks.push(callback);
}

/**
 * @param {number} sec
 */
export function delaySec(sec) {
    const targetTime = Instance.GetGameTime() + sec;
    return new Promise((resolve) => {
        delayActions.push({ targetTime, resolve });
    });
}

/**
 * @param {number} msec
 */
export function delay(msec) {
    return delaySec(msec / 1000);
}

export function nextTick() {
    return new Promise((resolve) => {
        delayActions.push({ targetTime: 0, resolve });
    });
}