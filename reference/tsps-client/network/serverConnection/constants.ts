import { getDefaultWsUrl } from "../../config/clientEnv";
import { readEnv } from "../../config/env";

export const WS_GLOBAL_KEY = "__OSRS_CLIENT_WS_SINGLETON__";
export const WS_SUPPRESS_RECONNECT_KEY = "__OSRS_CLIENT_WS_SUPPRESS_RECONNECT__";
export const INVENTORY_SLOT_COUNT = 28;
export const BANK_SLOT_COUNT_FALLBACK = 1410;
export const CLIENT_TICK_MS = 20;
export const RUN_ENERGY_MAX_UNITS = 10000;
export const DEFAULT_SERVER_TICK_MS = 600;

export const getEnv = (key: `VITE_${string}`): string | undefined => readEnv(key);

export const DEFAULT_URL = getDefaultWsUrl();
export const LOGIN_CONNECT_RETRY_DELAY_MS = 1000;
export const RECONNECT_DELAY_MAX_MS = 1000;
export const RECONNECT_MAX_ATTEMPTS = 1;
