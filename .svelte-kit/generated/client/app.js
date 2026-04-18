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
	() => import('./nodes/37')
];

export const server_loads = [];

export const dictionary = {
		"/event-logger": [9],
		"/game-overlay": [10],
		"/live": [11,[2]],
		"/live/dps": [12,[2]],
		"/live/dps/skills": [13,[2]],
		"/live/heal": [14,[2]],
		"/live/heal/skills": [15,[2]],
		"/live/tanked": [16,[2]],
		"/live/tanked/skills": [17,[2]],
		"/main": [18,[3]],
		"/main/custom-triggers": [19,[3,4]],
		"/main/dps": [20,[3,5]],
		"/main/dps/history": [21,[3,5]],
		"/main/dps/history/[id]": [22,[3,5]],
		"/main/dps/settings": [23,[3,5]],
		"/main/dps/themes": [24,[3,5]],
		"/main/localization": [25,[3]],
		"/main/module-calc": [26,[3]],
		"/main/monster-monitor": [27,[3,6]],
		"/main/settings": [28,[3,7]],
		"/main/settings/debug": [29,[3,7]],
		"/main/settings/hotkeys": [30,[3,7]],
		"/main/settings/locales": [31,[3,7]],
		"/main/settings/network": [32,[3,7]],
		"/main/settings/overlay": [33,[3,7]],
		"/main/settings/profile": [34,[3,7]],
		"/main/settings/themes": [35,[3,7]],
		"/main/skill-monitor": [36,[3,8]],
		"/monster-overlay": [37]
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