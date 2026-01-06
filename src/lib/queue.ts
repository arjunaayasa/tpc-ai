import { Queue } from 'bullmq';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse Redis URL for connection options
function parseRedisUrl(url: string): { host: string; port: number } {
    const parsed = new URL(url);
    return {
        host: parsed.hostname || 'localhost',
        port: parseInt(parsed.port, 10) || 6379,
    };
}

// Create the extraction queue
const globalForQueue = globalThis as unknown as {
    extractionQueue: Queue | undefined;
};

export const getExtractionQueue = (): Queue => {
    if (!globalForQueue.extractionQueue) {
        const { host, port } = parseRedisUrl(redisUrl);
        globalForQueue.extractionQueue = new Queue('extraction', {
            connection: {
                host,
                port,
                maxRetriesPerRequest: null,
            },
            defaultJobOptions: {
                removeOnComplete: 100, // Keep last 100 completed jobs
                removeOnFail: 50,      // Keep last 50 failed jobs
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
            },
        });
    }
    return globalForQueue.extractionQueue;
};

export interface ExtractMetadataJobData {
    documentId: string;
}

export { redisUrl };
