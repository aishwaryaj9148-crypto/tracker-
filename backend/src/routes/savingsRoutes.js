const express = require('express');
const router = express.Router();
const {
  getAllSavingsGoals,
  getSavingsGoalById,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
} = require('../controllers/savingsController');

router.get('/', getAllSavingsGoals);
router.get('/:id', getSavingsGoalById);
router.post('/', createSavingsGoal);
router.put('/:id', updateSavingsGoal);
router.delete('/:id', deleteSavingsGoal);

module.exports = router;
