import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import companiesRouter from "./companies";
import contactsRouter from "./contacts";
import leadsRouter from "./leads";
import interactionsRouter from "./interactions";
import tasksRouter from "./tasks";
import signalsRouter from "./signals";
import documentsRouter from "./documents";
import dashboardRouter from "./dashboard";
import chatRouter from "./chat";
import voiceRouter from "./voice";
import importExportRouter from "./importExport";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(companiesRouter);
router.use(contactsRouter);
router.use(leadsRouter);
router.use(interactionsRouter);
router.use(tasksRouter);
router.use(signalsRouter);
router.use(documentsRouter);
router.use(dashboardRouter);
router.use(chatRouter);
router.use(voiceRouter);
router.use(importExportRouter);

export default router;
