"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const validation_1 = require("../../validation");
const schemas_1 = require("../../validation/schemas");
const SwarmRepository_1 = require("../../storage/repositories/SwarmRepository");
const AgentRepository_1 = require("../../storage/repositories/AgentRepository");
const router = (0, express_1.Router)();
// GET /api/swarm - List swarms
router.get('/', async (req, res, next) => {
    try {
        const repo = new SwarmRepository_1.SwarmRepository();
        const swarms = await repo.list();
        res.json({ swarms });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/swarm/:id - Get swarm by ID
router.get('/:id', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), async (req, res, next) => {
    try {
        const { id } = req.params;
        const repo = new SwarmRepository_1.SwarmRepository();
        const swarm = await repo.findById(id);
        if (!swarm) {
            throw new validation_1.NotFoundError('Swarm', id);
        }
        // Get agent count
        const agentRepo = new AgentRepository_1.AgentRepository();
        const agents = await agentRepo.findBySwarmId(id);
        res.json({
            ...swarm,
            agentCount: agents.length,
            agents: agents.map(a => ({ id: a.id, status: a.status })),
        });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/swarm - Create new swarm
router.post('/', (0, validation_1.validateRequest)(schemas_1.createSwarmSchema), async (req, res, next) => {
    try {
        const data = req.body;
        const repo = new SwarmRepository_1.SwarmRepository();
        const swarm = await repo.create({
            name: data.name,
            status: 'running',
            config: {
                strategy: data.strategy,
                agentCount: data.agents,
                ...data.config,
            },
        });
        res.status(201).json(swarm);
    }
    catch (error) {
        next(error);
    }
});
// PATCH /api/swarm/:id - Update swarm
router.patch('/:id', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), (0, validation_1.validateRequest)(schemas_1.updateSwarmSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const repo = new SwarmRepository_1.SwarmRepository();
        const existing = await repo.findById(id);
        if (!existing) {
            throw new validation_1.NotFoundError('Swarm', id);
        }
        const updated = await repo.update(id, {
            ...(data.name && { name: data.name }),
            ...(data.status && { status: data.status }),
            ...(data.config && { config: data.config }),
        });
        res.json(updated);
    }
    catch (error) {
        next(error);
    }
});
// DELETE /api/swarm/:id - Destroy swarm
router.delete('/:id', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), async (req, res, next) => {
    try {
        const { id } = req.params;
        const repo = new SwarmRepository_1.SwarmRepository();
        const agentRepo = new AgentRepository_1.AgentRepository();
        const existing = await repo.findById(id);
        if (!existing) {
            throw new validation_1.NotFoundError('Swarm', id);
        }
        // Kill all agents in swarm first
        const agents = await agentRepo.findBySwarmId(id);
        for (const agent of agents) {
            await agentRepo.updateStatus(agent.id, 'killing');
        }
        // Delete swarm
        await repo.delete(id);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
// POST /api/swarm/:id/scale - Scale swarm
router.post('/:id/scale', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), (0, validation_1.validateRequest)(schemas_1.swarmActionSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { targetAgents } = req.body;
        const repo = new SwarmRepository_1.SwarmRepository();
        const agentRepo = new AgentRepository_1.AgentRepository();
        const swarm = await repo.findById(id);
        if (!swarm) {
            throw new validation_1.NotFoundError('Swarm', id);
        }
        const currentAgents = await agentRepo.findBySwarmId(id);
        const currentCount = currentAgents.length;
        const targetCount = targetAgents;
        if (targetCount > currentCount) {
            // Scale up - spawn new agents
            for (let i = currentCount; i < targetCount; i++) {
                await agentRepo.create({
                    swarm_id: id,
                    status: 'spawning',
                    task: 'Auto-scaled agent',
                });
            }
        }
        else if (targetCount < currentCount) {
            // Scale down - kill excess agents
            const excess = currentAgents.slice(targetCount);
            for (const agent of excess) {
                await agentRepo.updateStatus(agent.id, 'killing');
            }
        }
        const updatedAgents = await agentRepo.findBySwarmId(id);
        res.json({
            swarmId: id,
            previousCount: currentCount,
            newCount: updatedAgents.length,
            agents: updatedAgents,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=swarm.js.map