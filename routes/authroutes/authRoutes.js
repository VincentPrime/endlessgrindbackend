import express from 'express';
import { signup, login, logout, getAllUsers,deleteUsers,getSession } from '../../Controller/auth/authContrellor.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/allUsers', getAllUsers);
router.delete("/delete:id", deleteUsers); 
router.get("/session", getSession)

export default router;

