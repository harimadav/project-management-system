const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) {
    console.log("Database Connection Failed");
    console.log(err);
    return;
  }

  console.log("MySQL Connected Successfully");
});

// MIDDLEWARE: verify JWT and attach user info to req.user
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    req.user = user; // { id, email }
    next();
  });
}

app.get("/", (req, res) => {
  res.json({
    message: "Project Management API Running"
  });
});

// REGISTER
app.post("/register", async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    db.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
      async (err, results) => {
        if (err) {
          return res.status(500).json(err);
        }

        if (results.length > 0) {
          return res.status(400).json({
            message: "Email already exists"
          });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.query(
          "INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)",
          [full_name, email, hashedPassword],
          (err) => {
            if (err) {
              return res.status(500).json(err);
            }

            res.status(201).json({
              message: "User Registered Successfully"
            });
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json(error);
  }
});

// LOGIN
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (results.length === 0) {
        return res.status(400).json({
          message: "Invalid Email"
        });
      }

      const user = results[0];

      const isMatch = await bcrypt.compare(
        password,
        user.password
      );

      if (!isMatch) {
        return res.status(400).json({
          message: "Invalid Password"
        });
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "1d"
        }
      );

      res.json({
        message: "Login Successful",
        token,
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email
        }
      });
    }
  );
});

const PORT = process.env.PORT || 5000;


// ================== PROJECTS (all routes below require auth) ==================

// CREATE PROJECT (user_id taken from token, not req.body, so it can't be spoofed)
app.post("/projects", authenticateToken, (req, res) => {
  const {
    project_name,
    description,
    status,
    start_date,
    end_date
  } = req.body;

  const user_id = req.user.id;

  db.query(
    `INSERT INTO projects 
    (user_id, project_name, description, status, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      project_name,
      description,
      status,
      start_date,
      end_date
    ],
    (err, result) => {
      if (err) return res.status(500).json(err);

      res.json({
        message: "Project Created Successfully",
        id: result.insertId
      });
    }
  );
});

// GET ALL PROJECTS FOR LOGGED-IN USER ONLY
app.get("/projects", authenticateToken, (req, res) => {
  const user_id = req.user.id;

  db.query(
    "SELECT * FROM projects WHERE user_id = ?",
    [user_id],
    (err, results) => {
      if (err) return res.status(500).json(err);

      res.json(results);
    }
  );
});

// UPDATE PROJECT (only if it belongs to the logged-in user)
app.put("/projects/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  const {
    project_name,
    description,
    status,
    start_date,
    end_date
  } = req.body;

  db.query(
    `UPDATE projects
     SET project_name=?,
         description=?,
         status=?,
         start_date=?,
         end_date=?
     WHERE id=? AND user_id=?`,
    [
      project_name,
      description,
      status,
      start_date,
      end_date,
      id,
      user_id
    ],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Project not found or not yours to edit"
        });
      }

      res.json({
        message: "Project Updated Successfully"
      });
    }
  );
});

// DELETE PROJECT (only if it belongs to the logged-in user)
app.delete("/projects/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  db.query(
    "DELETE FROM projects WHERE id=? AND user_id=?",
    [id, user_id],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Project not found or not yours to delete"
        });
      }

      res.json({
        message: "Project Deleted Successfully"
      });
    }
  );
});

// ================== TASKS (all routes below require auth) ==================
// tasks link to projects via project_id, and projects link to users via user_id
// so we verify ownership of the parent project before creating/updating/deleting a task

// CREATE TASK (only allowed if the project belongs to the logged-in user)
app.post("/tasks", authenticateToken, (req, res) => {
  const {
    project_id,
    task_name,
    description,
    priority,
    status,
    due_date
  } = req.body;

  const user_id = req.user.id;

  // Verify the project belongs to this user before inserting the task
  db.query(
    "SELECT id FROM projects WHERE id = ? AND user_id = ?",
    [project_id, user_id],
    (err, projectResults) => {
      if (err) return res.status(500).json(err);

      if (projectResults.length === 0) {
        return res.status(403).json({
          message: "You do not have access to this project"
        });
      }

      db.query(
        `INSERT INTO tasks
        (project_id, task_name, description, priority, status, due_date)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          project_id,
          task_name,
          description,
          priority,
          status,
          due_date
        ],
        (err, result) => {
          if (err) return res.status(500).json(err);

          res.json({
            message: "Task Created Successfully",
            id: result.insertId
          });
        }
      );
    }
  );
});

// GET ALL TASKS FOR LOGGED-IN USER ONLY (joins through projects)
app.get("/tasks", authenticateToken, (req, res) => {
  const user_id = req.user.id;

  db.query(
    `SELECT tasks.*
     FROM tasks
     INNER JOIN projects ON tasks.project_id = projects.id
     WHERE projects.user_id = ?`,
    [user_id],
    (err, results) => {
      if (err) return res.status(500).json(err);

      res.json(results);
    }
  );
});

// GET TASKS FOR A SPECIFIC PROJECT (only if it belongs to the logged-in user)
app.get("/projects/:projectId/tasks", authenticateToken, (req, res) => {
  const { projectId } = req.params;
  const user_id = req.user.id;

  db.query(
    `SELECT tasks.*
     FROM tasks
     INNER JOIN projects ON tasks.project_id = projects.id
     WHERE projects.user_id = ? AND tasks.project_id = ?`,
    [user_id, projectId],
    (err, results) => {
      if (err) return res.status(500).json(err);

      res.json(results);
    }
  );
});

// UPDATE TASK (only if the parent project belongs to the logged-in user)
app.put("/tasks/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  const {
    task_name,
    description,
    priority,
    status,
    due_date
  } = req.body;

  db.query(
    `UPDATE tasks
     INNER JOIN projects ON tasks.project_id = projects.id
     SET tasks.task_name=?,
         tasks.description=?,
         tasks.priority=?,
         tasks.status=?,
         tasks.due_date=?
     WHERE tasks.id=? AND projects.user_id=?`,
    [
      task_name,
      description,
      priority,
      status,
      due_date,
      id,
      user_id
    ],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Task not found or not yours to edit"
        });
      }

      res.json({
        message: "Task Updated Successfully"
      });
    }
  );
});

// DELETE TASK (only if the parent project belongs to the logged-in user)
app.delete("/tasks/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  db.query(
    `DELETE tasks FROM tasks
     INNER JOIN projects ON tasks.project_id = projects.id
     WHERE tasks.id=? AND projects.user_id=?`,
    [id, user_id],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Task not found or not yours to delete"
        });
      }

      res.json({
        message: "Task Deleted Successfully"
      });
    }
  );
});

// DASHBOARD (scoped to logged-in user)
app.get("/dashboard", authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const dashboard = {};

  db.query(
    "SELECT COUNT(*) AS totalProjects FROM projects WHERE user_id = ?",
    [user_id],
    (err, projects) => {
      if (err) return res.status(500).json(err);

      dashboard.totalProjects =
        projects[0].totalProjects;

      db.query(
        `SELECT COUNT(*) AS totalTasks
         FROM tasks
         INNER JOIN projects ON tasks.project_id = projects.id
         WHERE projects.user_id = ?`,
        [user_id],
        (err, tasks) => {
          if (err) return res.status(500).json(err);

          dashboard.totalTasks =
            tasks[0].totalTasks;

          db.query(
            `SELECT COUNT(*) AS completedTasks
             FROM tasks
             INNER JOIN projects ON tasks.project_id = projects.id
             WHERE projects.user_id = ? AND tasks.status='Completed'`,
            [user_id],
            (err, completed) => {
              if (err)
                return res.status(500).json(err);

              dashboard.completedTasks =
                completed[0].completedTasks;

              db.query(
                `SELECT COUNT(*) AS pendingTasks
                 FROM tasks
                 INNER JOIN projects ON tasks.project_id = projects.id
                 WHERE projects.user_id = ? AND tasks.status='Pending'`,
                [user_id],
                (err, pending) => {
                  if (err)
                    return res.status(500).json(err);

                  dashboard.pendingTasks =
                    pending[0].pendingTasks;

                  db.query(
                    "SELECT COUNT(*) AS projectsInProgress FROM projects WHERE user_id = ? AND status='In Progress'",
                    [user_id],
                    (err, progress) => {
                      if (err)
                        return res.status(500).json(err);

                      dashboard.projectsInProgress =
                        progress[0].projectsInProgress;

                      res.json(dashboard);
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server Running On Port ${PORT}`);
});
