require('dotenv').config({ path: require('path').join(__dirname,'../.env') });
const mongoose = require('mongoose');
const Question = require('../models/Question');

const questions = [
  // HR / Behavioral
  { type:'hr', category:'HR',         difficulty:'easy',   text:'Tell me about yourself and your background.' },
  { type:'hr', category:'HR',         difficulty:'easy',   text:'Why do you want to join this company?' },
  { type:'hr', category:'HR',         difficulty:'medium', text:'Where do you see yourself in 5 years?' },
  { type:'hr', category:'HR',         difficulty:'medium', text:'What are your greatest strengths and weaknesses?' },
  { type:'hr', category:'HR',         difficulty:'medium', text:'Why should we hire you over other candidates?' },
  { type:'hr', category:'HR',         difficulty:'easy',   text:'What salary are you expecting?' },
  { type:'hr', category:'HR',         difficulty:'hard',   text:'Describe a situation where you disagreed with your manager. How did you handle it?' },
  { type:'hr', category:'Behavioral', difficulty:'medium', text:'Tell me about a time you worked under pressure. What was the outcome?' },
  { type:'hr', category:'Behavioral', difficulty:'medium', text:'Describe a time you failed. What did you learn from it?' },
  { type:'hr', category:'Behavioral', difficulty:'medium', text:'Give an example of a time you showed leadership.' },
  { type:'hr', category:'Behavioral', difficulty:'hard',   text:'Tell me about a time you had to manage multiple priorities simultaneously.' },
  { type:'hr', category:'Behavioral', difficulty:'easy',   text:'Describe a time you went above and beyond for a project.' },
  { type:'hr', category:'Situational',difficulty:'medium', text:'If you were given a project with an unrealistic deadline, what would you do?' },
  { type:'hr', category:'Situational',difficulty:'medium', text:'How would you handle a conflict with a team member?' },
  { type:'hr', category:'Situational',difficulty:'hard',   text:'If you discovered your colleague was doing something unethical, what would you do?' },
  // DSA
  { type:'technical', category:'DSA', difficulty:'easy',   text:'What is the time complexity of binary search?' },
  { type:'technical', category:'DSA', difficulty:'easy',   text:'Explain the difference between a stack and a queue.' },
  { type:'technical', category:'DSA', difficulty:'medium', text:'How does quicksort work? What is its average and worst-case time complexity?' },
  { type:'technical', category:'DSA', difficulty:'medium', text:'What is dynamic programming? Give an example problem.' },
  { type:'technical', category:'DSA', difficulty:'medium', text:'Explain BFS and DFS. When would you use each?' },
  { type:'technical', category:'DSA', difficulty:'hard',   text:'What is a Red-Black tree and how does it maintain balance?' },
  { type:'technical', category:'DSA', difficulty:'hard',   text:'Explain Dijkstra\'s algorithm and its time complexity.' },
  { type:'technical', category:'DSA', difficulty:'medium', text:'What is a hash table? How do you handle collisions?' },
  { type:'technical', category:'DSA', difficulty:'easy',   text:'What is the difference between an array and a linked list?' },
  { type:'technical', category:'DSA', difficulty:'medium', text:'What is a heap? Explain min-heap and max-heap.' },
  // OOP
  { type:'technical', category:'OOP', difficulty:'easy',   text:'What are the four pillars of OOP? Explain each.' },
  { type:'technical', category:'OOP', difficulty:'easy',   text:'What is the difference between abstraction and encapsulation?' },
  { type:'technical', category:'OOP', difficulty:'medium', text:'What is the difference between an interface and an abstract class?' },
  { type:'technical', category:'OOP', difficulty:'medium', text:'Explain polymorphism with a real-world example.' },
  { type:'technical', category:'OOP', difficulty:'medium', text:'What is method overloading vs method overriding?' },
  { type:'technical', category:'OOP', difficulty:'hard',   text:'Explain the SOLID principles.' },
  { type:'technical', category:'OOP', difficulty:'medium', text:'What is a design pattern? Explain the Singleton pattern.' },
  { type:'technical', category:'OOP', difficulty:'medium', text:'What is the Factory design pattern?' },
  { type:'technical', category:'OOP', difficulty:'easy',   text:'What is inheritance? Explain with an example.' },
  { type:'technical', category:'OOP', difficulty:'hard',   text:'What is the difference between composition and inheritance?' },
  // DBMS
  { type:'technical', category:'DBMS', difficulty:'easy',  text:'What is normalization? Explain 1NF, 2NF, and 3NF.' },
  { type:'technical', category:'DBMS', difficulty:'easy',  text:'What is the difference between SQL and NoSQL databases?' },
  { type:'technical', category:'DBMS', difficulty:'medium',text:'What are ACID properties? Explain each.' },
  { type:'technical', category:'DBMS', difficulty:'medium',text:'What is indexing in databases? How does it improve performance?' },
  { type:'technical', category:'DBMS', difficulty:'medium',text:'Explain the difference between INNER JOIN, LEFT JOIN, RIGHT JOIN, and FULL JOIN.' },
  { type:'technical', category:'DBMS', difficulty:'hard',  text:'What is a deadlock? How can you prevent it?' },
  { type:'technical', category:'DBMS', difficulty:'medium',text:'What is a transaction? How does COMMIT and ROLLBACK work?' },
  { type:'technical', category:'DBMS', difficulty:'easy',  text:'What is a primary key vs a foreign key?' },
  { type:'technical', category:'DBMS', difficulty:'hard',  text:'What are database triggers? Give an example use case.' },
  { type:'technical', category:'DBMS', difficulty:'medium',text:'Explain the concept of database sharding.' },
  // OS
  { type:'technical', category:'OS', difficulty:'easy',    text:'What is the difference between a process and a thread?' },
  { type:'technical', category:'OS', difficulty:'medium',  text:'Explain paging and segmentation in memory management.' },
  { type:'technical', category:'OS', difficulty:'medium',  text:'What is virtual memory? How does it work?' },
  { type:'technical', category:'OS', difficulty:'medium',  text:'What are the different CPU scheduling algorithms? Compare them.' },
  { type:'technical', category:'OS', difficulty:'hard',    text:'What is a race condition? How do semaphores help prevent it?' },
  { type:'technical', category:'OS', difficulty:'easy',    text:'What is the difference between preemptive and non-preemptive scheduling?' },
  { type:'technical', category:'OS', difficulty:'medium',  text:'What is a deadlock? What are the four necessary conditions?' },
  { type:'technical', category:'OS', difficulty:'medium',  text:'Explain the concept of thrashing.' },
  // CN
  { type:'technical', category:'CN', difficulty:'easy',    text:'What is the difference between TCP and UDP?' },
  { type:'technical', category:'CN', difficulty:'easy',    text:'Explain the OSI model and its 7 layers.' },
  { type:'technical', category:'CN', difficulty:'medium',  text:'What is the difference between HTTP and HTTPS?' },
  { type:'technical', category:'CN', difficulty:'medium',  text:'What is DNS? How does domain name resolution work?' },
  { type:'technical', category:'CN', difficulty:'medium',  text:'What is a subnet mask? How does subnetting work?' },
  { type:'technical', category:'CN', difficulty:'hard',    text:'Explain the TCP three-way handshake.' },
  { type:'technical', category:'CN', difficulty:'medium',  text:'What is the difference between a router and a switch?' },
  { type:'technical', category:'CN', difficulty:'medium',  text:'What is HTTPS? How does SSL/TLS work?' },
  // Web Development
  { type:'technical', category:'Web Development', difficulty:'easy',   text:'What is the difference between HTML, CSS, and JavaScript?' },
  { type:'technical', category:'Web Development', difficulty:'easy',   text:'Explain the difference between GET and POST HTTP methods.' },
  { type:'technical', category:'Web Development', difficulty:'medium', text:'What is REST API? What are its principles?' },
  { type:'technical', category:'Web Development', difficulty:'medium', text:'What is the difference between cookies, localStorage, and sessionStorage?' },
  { type:'technical', category:'Web Development', difficulty:'medium', text:'What is CORS? How do you handle it?' },
  { type:'technical', category:'Web Development', difficulty:'hard',   text:'What is the event loop in JavaScript? How does async/await work?' },
  { type:'technical', category:'Web Development', difficulty:'medium', text:'What is the difference between SQL and MongoDB?' },
  { type:'technical', category:'Web Development', difficulty:'medium', text:'Explain the MVC architecture pattern.' },
  { type:'technical', category:'Web Development', difficulty:'easy',   text:'What is an API? What is the difference between REST and GraphQL?' },
  { type:'technical', category:'Web Development', difficulty:'hard',   text:'What are WebSockets? When would you use them over HTTP?' },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  await Question.deleteMany({});
  await Question.insertMany(questions);
  console.log(`✅  Seeded ${questions.length} questions successfully`);
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });
