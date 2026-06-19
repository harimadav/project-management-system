import React, { useState, useEffect } from "react";
import "./App.css";

const API_URL = "https://project-management-backend-vh76.onrender.com";

function statusBadgeClass(status) {
  const key = (status || "").toLowerCase().replace(/\s+/g, "-");
  return `badge badge-status-${key}`;
}

function priorityBadgeClass(priority) {
  const key = (priority || "").toLowerCase();
  return `badge badge-priority-${key}`;
}

function App() {
  // ---------- THEME STATE ----------
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // ---------- AUTH STATE ----------
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(
    localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")) : null
  );

  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [authForm, setAuthForm] = useState({
    full_name: "",
    email: "",
    password: ""
  });
  const [authError, setAuthError] = useState("");

  // ---------- APP DATA STATE ----------
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [projectForm, setProjectForm] = useState({
    project_name: "",
    description: "",
    status: "Pending",
    start_date: "",
    end_date: ""
  });
  const [editingProjectId, setEditingProjectId] = useState(null);

  const [taskForm, setTaskForm] = useState({
    project_id: "",
    task_name: "",
    description: "",
    priority: "Medium",
    status: "Pending",
    due_date: ""
  });
  const [editingTaskId, setEditingTaskId] = useState(null);

  const [pageError, setPageError] = useState("");

  // ---------- HELPERS ----------
  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  });

  const logout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setProjects([]);
    setTasks([]);
  };

  // ---------- AUTH HANDLERS ----------
  const handleAuthChange = (e) => {
    setAuthForm({ ...authForm, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.message || "Registration failed");
        return;
      }

      // auto-switch to login after successful registration
      setAuthMode("login");
      setAuthForm({ full_name: "", email: authForm.email, password: "" });
      setAuthError("Registration successful. Please log in.");
    } catch (err) {
      setAuthError("Could not reach the server");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.message || "Login failed");
        return;
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setAuthForm({ full_name: "", email: "", password: "" });
    } catch (err) {
      setAuthError("Could not reach the server");
    }
  };

  // ---------- DATA FETCHING ----------
  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_URL}/projects`, {
        headers: authHeaders()
      });

      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }

      const data = await res.json();
      setProjects(data);
    } catch (err) {
      setPageError("Failed to load projects");
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API_URL}/tasks`, {
        headers: authHeaders()
      });

      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }

      const data = await res.json();
      setTasks(data);
    } catch (err) {
      setPageError("Failed to load tasks");
    }
  };

  useEffect(() => {
    if (token) {
      fetchProjects();
      fetchTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---------- PROJECT HANDLERS ----------
  const handleProjectChange = (e) => {
    setProjectForm({ ...projectForm, [e.target.name]: e.target.value });
  };

  const resetProjectForm = () => {
    setProjectForm({
      project_name: "",
      description: "",
      status: "Pending",
      start_date: "",
      end_date: ""
    });
    setEditingProjectId(null);
  };

  const handleProjectSubmit = async (e) => {
    e.preventDefault();
    setPageError("");

    try {
      const url = editingProjectId
        ? `${API_URL}/projects/${editingProjectId}`
        : `${API_URL}/projects`;
      const method = editingProjectId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(projectForm)
      });

      const data = await res.json();

      if (!res.ok) {
        setPageError(data.message || "Failed to save project");
        return;
      }

      resetProjectForm();
      fetchProjects();
    } catch (err) {
      setPageError("Could not reach the server");
    }
  };

  const handleEditProject = (project) => {
    setEditingProjectId(project.id);
    setProjectForm({
      project_name: project.project_name || "",
      description: project.description || "",
      status: project.status || "Pending",
      start_date: project.start_date ? project.start_date.slice(0, 10) : "",
      end_date: project.end_date ? project.end_date.slice(0, 10) : ""
    });
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm("Delete this project and all its tasks?")) return;

    try {
      const res = await fetch(`${API_URL}/projects/${id}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      const data = await res.json();

      if (!res.ok) {
        setPageError(data.message || "Failed to delete project");
        return;
      }

      fetchProjects();
      fetchTasks();
      if (selectedProjectId === id) setSelectedProjectId(null);
    } catch (err) {
      setPageError("Could not reach the server");
    }
  };

  // ---------- TASK HANDLERS ----------
  const handleTaskChange = (e) => {
    setTaskForm({ ...taskForm, [e.target.name]: e.target.value });
  };

  const resetTaskForm = () => {
    setTaskForm({
      project_id: selectedProjectId || "",
      task_name: "",
      description: "",
      priority: "Medium",
      status: "Pending",
      due_date: ""
    });
    setEditingTaskId(null);
  };

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    setPageError("");

    if (!taskForm.project_id) {
      setPageError("Please select a project for this task");
      return;
    }

    try {
      const url = editingTaskId
        ? `${API_URL}/tasks/${editingTaskId}`
        : `${API_URL}/tasks`;
      const method = editingTaskId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(taskForm)
      });

      const data = await res.json();

      if (!res.ok) {
        setPageError(data.message || "Failed to save task");
        return;
      }

      resetTaskForm();
      fetchTasks();
    } catch (err) {
      setPageError("Could not reach the server");
    }
  };

  const handleEditTask = (task) => {
    setEditingTaskId(task.id);
    setTaskForm({
      project_id: task.project_id,
      task_name: task.task_name || "",
      description: task.description || "",
      priority: task.priority || "Medium",
      status: task.status || "Pending",
      due_date: task.due_date ? task.due_date.slice(0, 10) : ""
    });
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm("Delete this task?")) return;

    try {
      const res = await fetch(`${API_URL}/tasks/${id}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      const data = await res.json();

      if (!res.ok) {
        setPageError(data.message || "Failed to delete task");
        return;
      }

      fetchTasks();
    } catch (err) {
      setPageError("Could not reach the server");
    }
  };

  // ---------- DERIVED DATA ----------
  const visibleTasks = selectedProjectId
    ? tasks.filter((t) => t.project_id === selectedProjectId)
    : tasks;

  // ================== RENDER: AUTH SCREEN ==================
  if (!token || !user) {
    return (
      <div className="auth-page" data-theme={theme}>
        <button
          type="button"
          className="theme-toggle auth-theme-toggle"
          onClick={toggleTheme}
        >
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>

        <div className="auth-card">
          <h1>Project Manager</h1>
          <p className="auth-subtitle">Plan projects. Track tasks. Stay on top of it.</p>

          <div className="auth-toggle">
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
            >
              Login
            </button>
            <button
              className={authMode === "register" ? "active" : ""}
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
              }}
            >
              Register
            </button>
          </div>

          {authError && <p className="auth-error">{authError}</p>}

          {authMode === "login" ? (
            <form onSubmit={handleLogin}>
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={authForm.email}
                onChange={handleAuthChange}
                required
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={authForm.password}
                onChange={handleAuthChange}
                required
              />
              <button type="submit">Login</button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <input
                type="text"
                name="full_name"
                placeholder="Full Name"
                value={authForm.full_name}
                onChange={handleAuthChange}
                required
              />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={authForm.email}
                onChange={handleAuthChange}
                required
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={authForm.password}
                onChange={handleAuthChange}
                required
              />
              <button type="submit">Register</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ================== RENDER: MAIN APP ==================
  return (
    <div className="app" data-theme={theme}>
      <header className="app-header">
        <h1>Project Manager</h1>
        <div className="header-right">
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
          <span>Welcome, {user.full_name}</span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      {pageError && <p className="page-error">{pageError}</p>}

      <div className="main-grid">
        {/* ---------- PROJECTS COLUMN ---------- */}
        <section className="panel">
          <h2>{editingProjectId ? "Edit Project" : "New Project"}</h2>
          <form onSubmit={handleProjectSubmit} className="form">
            <input
              type="text"
              name="project_name"
              placeholder="Project Name"
              value={projectForm.project_name}
              onChange={handleProjectChange}
              required
            />
            <textarea
              name="description"
              placeholder="Description"
              value={projectForm.description}
              onChange={handleProjectChange}
            />
            <select
              name="status"
              value={projectForm.status}
              onChange={handleProjectChange}
            >
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
            <label>Start Date</label>
            <input
              type="date"
              name="start_date"
              value={projectForm.start_date}
              onChange={handleProjectChange}
            />
            <label>End Date</label>
            <input
              type="date"
              name="end_date"
              value={projectForm.end_date}
              onChange={handleProjectChange}
            />
            <div className="form-buttons">
              <button type="submit">
                {editingProjectId ? "Update Project" : "Add Project"}
              </button>
              {editingProjectId && (
                <button type="button" onClick={resetProjectForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <h2>Your Projects</h2>
          <ul className="list">
            {projects.length === 0 && <p className="empty-state">No projects yet.</p>}
            {projects.map((p) => (
              <li
                key={p.id}
                className={`list-item ${
                  selectedProjectId === p.id ? "selected" : ""
                }`}
              >
                <div
                  className="item-main"
                  onClick={() =>
                    setSelectedProjectId(
                      selectedProjectId === p.id ? null : p.id
                    )
                  }
                >
                  <strong>{p.project_name}</strong>
                  <span className="item-meta">
                    <span className={statusBadgeClass(p.status)}>{p.status}</span>
                  </span>
                  <p className="muted">{p.description}</p>
                </div>
                <div className="item-buttons">
                  <button onClick={() => handleEditProject(p)}>Edit</button>
                  <button onClick={() => handleDeleteProject(p.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- TASKS COLUMN ---------- */}
        <section className="panel">
          <h2>{editingTaskId ? "Edit Task" : "New Task"}</h2>
          <form onSubmit={handleTaskSubmit} className="form">
            <select
              name="project_id"
              value={taskForm.project_id}
              onChange={handleTaskChange}
              required
            >
              <option value="">Select Project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_name}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="task_name"
              placeholder="Task Name"
              value={taskForm.task_name}
              onChange={handleTaskChange}
              required
            />
            <textarea
              name="description"
              placeholder="Description"
              value={taskForm.description}
              onChange={handleTaskChange}
            />
            <select
              name="priority"
              value={taskForm.priority}
              onChange={handleTaskChange}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <select
              name="status"
              value={taskForm.status}
              onChange={handleTaskChange}
            >
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
            <label>Due Date</label>
            <input
              type="date"
              name="due_date"
              value={taskForm.due_date}
              onChange={handleTaskChange}
            />
            <div className="form-buttons">
              <button type="submit">
                {editingTaskId ? "Update Task" : "Add Task"}
              </button>
              {editingTaskId && (
                <button type="button" onClick={resetTaskForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <h2>
            {selectedProjectId
              ? "Tasks for Selected Project"
              : "All Your Tasks"}
            {selectedProjectId && (
              <button
                className="link-btn"
                onClick={() => setSelectedProjectId(null)}
              >
                (show all)
              </button>
            )}
          </h2>
          <ul className="list">
            {visibleTasks.length === 0 && <p className="empty-state">No tasks yet.</p>}
            {visibleTasks.map((t) => (
              <li key={t.id} className="list-item">
                <div className="item-main">
                  <strong>{t.task_name}</strong>
                  <span className="item-meta">
                    <span className={statusBadgeClass(t.status)}>{t.status}</span>
                    <span className={priorityBadgeClass(t.priority)}>{t.priority}</span>
                  </span>
                  <p className="muted">{t.description}</p>
                </div>
                <div className="item-buttons">
                  <button onClick={() => handleEditTask(t)}>Edit</button>
                  <button onClick={() => handleDeleteTask(t.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default App;
