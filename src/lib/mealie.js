import axios from 'axios';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({
    path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
});

function apiBaseUrl() {
    const raw = (process.env.MEALIE_BASE_URL || '').replace(/\/$/, '');
    if (!raw) {
        throw new Error('MEALIE_BASE_URL is not set');
    }
    return raw.endsWith('/api') ? raw : `${raw}/api`;
}

const client = axios.create({
    baseURL: apiBaseUrl(),
    headers: {
        Authorization: `Bearer ${process.env.MEALIE_API_TOKEN}`,
    },
});

const MAX_RETRIES = 6;

client.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;
        if (!config) {
            return Promise.reject(error);
        }
        config.__retryCount = config.__retryCount ?? 0;
        const status = error.response?.status;
        const noResponse = Boolean(error.request && !error.response);
        const retryableStatus =
            status === 408 ||
            status === 425 ||
            status === 429 ||
            (status != null && status >= 500 && status <= 599);
        const retryable = retryableStatus || noResponse;

        if (!retryable || config.__retryCount >= MAX_RETRIES) {
            return Promise.reject(error);
        }
        if (status === 401 || status === 403) {
            return Promise.reject(error);
        }

        config.__retryCount += 1;
        const base = Math.min(750 * 2 ** (config.__retryCount - 1), 20000);
        const jitter = Math.random() * 400;
        await new Promise((r) => setTimeout(r, base + jitter));
        return client.request(config);
    },
);

class MealieClient {
    async getRecipes() {
        const response = await client.get('/recipes');
        return response.data;
    }

    /**
     * @param {string} startDate - ISO date YYYY-MM-DD
     * @param {string} endDate - ISO date YYYY-MM-DD
     */
    async getMealPlans(startDate, endDate) {
        const response = await client.get('/households/mealplans', {
            params: {
                start_date: startDate,
                end_date: endDate,
                perPage: -1,
                page: 1,
            },
        });
        return response.data;
    }

    /**
     * Uses Mealie's random mealpicker (household rules when configured).
     * @param {{ date: string, entryType: string }} body
     */
    async createRandomPlanEntry(body) {
        const response = await client.post('/households/mealplans/random', body);
        return response.data;
    }
}

export default new MealieClient();