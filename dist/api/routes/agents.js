"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const validation_1 = require("../../validation");
const schemas_1 = require("../../validation/schemas");
const AgentRepository_1 = require("../../storage/repositories/AgentRepository");
const SwarmRepository_1 = require("../../storage/repositories/SwarmRepository");
const router = (0, express_1.Router)();
// GET /api/agents - List agents
router.get('/', async (req, res, next) => {
    try {
        const repo = new AgentRepository_1.AgentRepository();
        const { swarmId, status } = req.query;
        let agents;
        if (swarmId) {
            agents = await repo.findBySwarmId(swarmId);
        }
        else {
            agents = await repo.list();
        }
        res.json({ agents });
    }
    catch (error) {
        next(error);
    }
});
// GET /api/agents/:id - Get agent by ID
router.get('/:id', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), async (req, res, next) => {
    try {
        const { id } = req.params;
        const repo = new AgentRepository_1.AgentRepository();
        const agent = await repo.findById(id);
        if (!agent) {
            throw new validation_1.NotFoundError('Agent', id);
        }
        res.json(agent);
    }
    catch (error) {
        next(error);
    }
});
// POST /api/agents - Spawn new agent
router.post('/', (0, validation_1.validateRequest)(schemas_1.spawnAgentSchema), async (req, res, next) => {
    try {
        const data = req.body;
        const repo = new AgentRepository_1.AgentRepository();
        // Validate swarm exists if provided
        if (data.swarmId) {
            const swarmRepo = new SwarmRepository_1.SwarmRepository();
            const swarm = await swarmRepo.findById(data.swarmId);
            if (!swarm) {
                throw new validation_1.NotFoundError('Swarm', data.swarmId);
            }
        }
        const agent = await repo.create({
            swarm_id: data.swarmId,
            parent_id: data.parentId,
            status: 'spawning',
            task: data.task,
            model: data.model,
        });
        res.status(201).json(agent);
    }
    catch (error) {
        next(error);
    }
});
// PATCH /api/agents/:id - Update agent
router.patch('/:id', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), (0, validation_1.validateRequest)(schemas_1.updateAgentSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const repo = new AgentRepository_1.AgentRepository();
        const existing = await repo.findById(id);
        if (!existing) {
            throw new validation_1.NotFoundError('Agent', id);
        }
        // AgentRepository only supports status updates
        if (data.status) {
            await repo.updateStatus(id, data.status);
        }
        const updated = await repo.findById(id);
        res.json(updated);
    }
    catch (error) {
        next(error);
    }
});
// DELETE /api/agents/:id - Kill agent
router.delete('/:id', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), async (req, res, next) => {
    try {
        const { id } = req.params;
        const repo = new AgentRepository_1.AgentRepository();
        const existing = await repo.findById(id);
        if (!existing) {
            throw new validation_1.NotFoundError('Agent', id);
        }
        await repo.updateStatus(id, 'killing');
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
// POST /api/agents/:id/action - Agent actions (kill, pause, resume, retry)
router.post('/:id/action', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), (0, validation_1.validateRequest)(schemas_1.agentActionSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action, reason, force } = req.body;
        const repo = new AgentRepository_1.AgentRepository();
        const agent = await repo.findById(id);
        if (!agent) {
            throw new validation_1.NotFoundError('Agent', id);
        }
        const statusMap = {
            kill: 'killing',
            pause: 'paused',
            resume: 'running',
            retry: 'spawning',
        };
        const newStatus = statusMap[action];
        if (!newStatus) {
            res.status(400).json({ error: 'Invalid action' });
            return;
        }
        await repo.updateStatus(id, newStatus);
        res.json({ id, action, status: newStatus });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/agents/:id/pause - Pause agent
router.post('/:id/pause', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), async (req, res, next) => {
    try {
        const { id } = req.params;
        const repo = new AgentRepository_1.AgentRepository();
        const agent = await repo.findById(id);
        if (!agent) {
            throw new validation_1.NotFoundError('Agent', id);
        }
        await repo.updateStatus(id, 'paused');
        res.json({ id, status: 'paused' });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/agents/:id/resume - Resume agent
router.post('/:id/resume', (0, validation_1.validateParams)(zod_1.z.object({ id: schemas_1.idSchema })), async (req, res, next) => {
    try {
        const { id } = req.params;
        const repo = new AgentRepository_1.AgentRepository();
        const agent = await repo.findById(id);
        if (!agent) {
            throw new validation_1.NotFoundError('Agent', id);
        }
        await repo.updateStatus(id, 'running');
        res.json({ id, status: 'running' });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=agents.js.map