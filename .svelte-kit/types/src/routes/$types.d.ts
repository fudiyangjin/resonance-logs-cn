import type * as Kit from '@sveltejs/kit';

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;
type RouteParams = {  };
type RouteId = '/';
type MaybeWithVoid<T> = {} extends T ? T | void : T;
export type RequiredKeys<T> = { [K in keyof T]-?: {} extends { [P in K]: T[K] } ? never : K; }[keyof T];
type OutputDataShape<T> = MaybeWithVoid<Omit<App.PageData, RequiredKeys<T>> & Partial<Pick<App.PageData, keyof T & keyof App.PageData>> & Record<string, any>>
type EnsureDefined<T> = T extends null | undefined ? {} : T;
type OptionalUnion<U extends Record<string, any>, A extends keyof U = U extends U ? keyof U : never> = U extends unknown ? { [P in Exclude<A, keyof U>]?: never } & U : never;
export type Snapshot<T = any> = Kit.Snapshot<T>;
type LayoutRouteId = RouteId | "/event-logger" | "/game-overlay" | "/live" | "/live/death" | "/live/death/deaths" | "/live/death/replay" | "/live/dps" | "/live/dps/skills" | "/live/heal" | "/live/heal/skills" | "/live/tanked" | "/live/tanked/skills" | "/main" | "/main/custom-triggers" | "/main/dps" | "/main/dps/history" | "/main/dps/history/[id]" | "/main/dps/settings" | "/main/dps/themes" | "/main/localization" | "/main/module-calc" | "/main/monster-monitor" | "/main/overlay" | "/main/overlay/monster-monitor" | "/main/overlay/skill-monitor" | "/main/settings" | "/main/settings/debug" | "/main/settings/hotkeys" | "/main/settings/locales" | "/main/settings/network" | "/main/settings/overlay" | "/main/settings/profile" | "/main/settings/themes" | "/main/skill-monitor" | "/monster-overlay" | null
type LayoutParams = RouteParams & { id?: string }
type LayoutParentData = EnsureDefined<{}>;

export type LayoutServerData = null;
export type LayoutLoad<OutputData extends OutputDataShape<LayoutParentData> = OutputDataShape<LayoutParentData>> = Kit.Load<LayoutParams, LayoutServerData, LayoutParentData, OutputData, LayoutRouteId>;
export type LayoutLoadEvent = Parameters<LayoutLoad>[0];
export type LayoutData = Expand<Omit<LayoutParentData, keyof LayoutParentData & EnsureDefined<LayoutServerData>> & OptionalUnion<EnsureDefined<LayoutParentData & EnsureDefined<LayoutServerData>>>>;
export type LayoutProps = { params: LayoutParams; data: LayoutData; children: import("svelte").Snippet }