export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11'),
	() => import('./nodes/12'),
	() => import('./nodes/13'),
	() => import('./nodes/14'),
	() => import('./nodes/15'),
	() => import('./nodes/16'),
	() => import('./nodes/17'),
	() => import('./nodes/18'),
	() => import('./nodes/19'),
	() => import('./nodes/20'),
	() => import('./nodes/21'),
	() => import('./nodes/22'),
	() => import('./nodes/23'),
	() => import('./nodes/24'),
	() => import('./nodes/25'),
	() => import('./nodes/26'),
	() => import('./nodes/27'),
	() => import('./nodes/28'),
	() => import('./nodes/29'),
	() => import('./nodes/30'),
	() => import('./nodes/31'),
	() => import('./nodes/32'),
	() => import('./nodes/33'),
	() => import('./nodes/34'),
	() => import('./nodes/35'),
	() => import('./nodes/36'),
	() => import('./nodes/37'),
	() => import('./nodes/38'),
	() => import('./nodes/39'),
	() => import('./nodes/40'),
	() => import('./nodes/41'),
	() => import('./nodes/42'),
	() => import('./nodes/43'),
	() => import('./nodes/44')
];

export const server_loads = [];

export const dictionary = {
		"/event-logger": [10],
		"/game-overlay": [11],
		"/live": [12,[2]],
		"/live/death": [13,[2]],
		"/live/death/deaths": [14,[2]],
		"/live/death/replay": [15,[2]],
		"/live/dps": [16,[2]],
		"/live/dps/skills": [17,[2]],
		"/live/heal": [18,[2]],
		"/live/heal/skills": [19,[2]],
		"/live/tanked": [20,[2]],
		"/live/tanked/skills": [21,[2]],
		"/main": [22,[3]],
		"/main/custom-triggers": [23,[3,4]],
		"/main/dps": [24,[3,5]],
		"/main/dps/history": [25,[3,5]],
		"/main/dps/history/[id]": [26,[3,5]],
		"/main/dps/settings": [27,[3,5]],
		"/main/dps/themes": [28,[3,5]],
		"/main/localization": [29,[3]],
		"/main/module-calc": [30,[3]],
		"/main/monster-monitor": [31,[3,6]],
		"/main/overlay": [32,[3,7]],
		"/main/overlay/monster-monitor": [33,[3,7]],
		"/main/overlay/skill-monitor": [34,[3,7]],
		"/main/settings": [35,[3,8]],
		"/main/settings/debug": [36,[3,8]],
		"/main/settings/hotkeys": [37,[3,8]],
		"/main/settings/locales": [38,[3,8]],
		"/main/settings/network": [39,[3,8]],
		"/main/settings/overlay": [40,[3,8]],
		"/main/settings/profile": [41,[3,8]],
		"/main/settings/themes": [42,[3,8]],
		"/main/skill-monitor": [43,[3,9]],
		"/monster-overlay": [44]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
	
	reroute: (() => {}),
	transport: {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));
export const encoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.encode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export { default as root } from '../root.js';