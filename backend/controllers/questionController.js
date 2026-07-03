const Question = require('../models/Question');

// GET /api/questions?type=hr&category=DSA
const getQuestions = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    if (req.query.type)     filter.type     = req.query.type;
    if (req.query.category) filter.category = req.query.category;
    const questions = await Question.find(filter).lean();
    res.json({ success: true, count: questions.length, data: questions });
  } catch (err) { next(err); }
};

// POST /api/questions  (admin)
const createQuestion = async (req, res, next) => {
  try {
    const q = await Question.create(req.body);
    res.status(201).json({ success: true, data: q });
  } catch (err) { next(err); }
};

// PUT /api/questions/:id  (admin)
const updateQuestion = async (req, res, next) => {
  try {
    const q = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!q) return res.status(404).json({ success: false, message: 'Question not found' });
    res.json({ success: true, data: q });
  } catch (err) { next(err); }
};

// DELETE /api/questions/:id  (admin)
const deleteQuestion = async (req, res, next) => {
  try {
    const q = await Question.findByIdAndDelete(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: 'Question not found' });
    res.json({ success: true, message: 'Question deleted' });
  } catch (err) { next(err); }
};

// POST /api/questions/seed  (admin - one-time seed)
const seedQuestions = async (req, res, next) => {
  try {
    const count = await Question.countDocuments();
    if (count > 0) return res.json({ success: true, message: `Database already has ${count} questions` });

    const SEED = [
      // HR
      { type:'hr', category:'Behavioral', difficulty:'medium', text:'Tell me about yourself.' },
      { type:'hr', category:'Behavioral', difficulty:'medium', text:'Describe a time you led a team.' },
      { type:'hr', category:'Situational', difficulty:'medium', text:'How do you handle tight deadlines?' },
      { type:'hr', category:'HR', difficulty:'easy', text:'Why do you want this role?' },
      { type:'hr', category:'HR', difficulty:'easy', text:'Where do you see yourself in 5 years?' },
      // Technical - DSA
      { type:'technical', category:'DSA', difficulty:'medium', text:'Explain BFS vs DFS with use cases.' },
      { type:'technical', category:'DSA', difficulty:'hard',   text:'What is Dynamic Programming? Solve Fibonacci with memoization.' },
      { type:'technical', category:'DSA', difficulty:'medium', text:'What is the time complexity of binary search?' },
      // Technical - DBMS
      { type:'technical', category:'DBMS', difficulty:'medium', text:'Explain normalisation and its forms (1NF, 2NF, 3NF).' },
      { type:'technical', category:'DBMS', difficulty:'hard',   text:'What are ACID properties? Why are they important?' },
      // Technical - OOP
      { type:'technical', category:'OOP', difficulty:'easy',   text:'What are the four pillars of OOP?' },
      { type:'technical', category:'OOP', difficulty:'medium', text:'Explain method overloading vs overriding.' },
      // Technical - OS
      { type:'technical', category:'OS', difficulty:'medium', text:'What is a deadlock? How can it be prevented?' },
      { type:'technical', category:'OS', difficulty:'medium', text:'Explain the difference between process and thread.' },
      // Technical - CN
      { type:'technical', category:'CN', difficulty:'medium', text:'What is the OSI model? Explain each layer briefly.' },
      { type:'technical', category:'CN', difficulty:'easy',   text:'What is the difference between TCP and UDP?' },
      // Technical - Web
      { type:'technical', category:'Web Development', difficulty:'medium', text:'Explain the JavaScript event loop.' },
      { type:'technical', category:'Web Development', difficulty:'easy',   text:'What are HTTP status codes? List common ones.' },
    ];

    await Question.insertMany(SEED);
    res.json({ success: true, message: `Seeded ${SEED.length} questions` });
  } catch (err) { next(err); }
};

module.exports = { getQuestions, createQuestion, updateQuestion, deleteQuestion, seedQuestions };
