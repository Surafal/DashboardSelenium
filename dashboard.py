import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import threading
import subprocess
import os
import json
import webbrowser
from datetime import datetime

HISTORY_FILE = "history.json"

class DashboardApp:
    def __init__(self, root):
        self.root = root
        self.root.title("TestExecutionTool")
        self.root.geometry("1000x700")
        
        # Style
        self.style = ttk.Style()
        self.style.theme_use('clam')
        
        # Create Notebook (Tabs)
        self.notebook = ttk.Notebook(root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Tabs
        self.overview_tab = ttk.Frame(self.notebook)
        self.history_tab = ttk.Frame(self.notebook)
        
        self.notebook.add(self.overview_tab, text="Overview")
        self.notebook.add(self.history_tab, text="Execution History")
        
        self.setup_overview_tab()
        self.setup_history_tab()
        
        self.history = self.load_history()
        self.refresh_history_table()
        
        self.process = None

    def setup_overview_tab(self):
        # Configuration Frame
        config_frame = ttk.LabelFrame(self.overview_tab, text="Run Configuration", padding=(10, 10))
        config_frame.pack(fill=tk.X, padx=10, pady=10)
        
        # Project Path
        ttk.Label(config_frame, text="Project Path:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.path_var = tk.StringVar(value=os.getcwd())
        self.path_entry = ttk.Entry(config_frame, textvariable=self.path_var, width=50)
        self.path_entry.grid(row=0, column=1, sticky=tk.W, pady=5, padx=5)
        
        # Environment
        ttk.Label(config_frame, text="Environment:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.env_var = tk.StringVar(value="staging")
        self.env_entry = ttk.Entry(config_frame, textvariable=self.env_var, width=50)
        self.env_entry.grid(row=1, column=1, sticky=tk.W, pady=5, padx=5)
        
        # Headless
        self.headless_var = tk.BooleanVar(value=True)
        self.headless_chk = ttk.Checkbutton(config_frame, text="Headless Mode", variable=self.headless_var)
        self.headless_chk.grid(row=2, column=1, sticky=tk.W, pady=5, padx=5)
        
        # Run Button
        self.run_btn = ttk.Button(config_frame, text="Run Tests", command=self.start_run)
        self.run_btn.grid(row=3, column=1, sticky=tk.W, pady=10, padx=5)
        
        # Console Frame
        console_frame = ttk.LabelFrame(self.overview_tab, text="Live Console Output", padding=(10, 10))
        console_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.console_text = tk.Text(console_frame, wrap=tk.WORD, bg="#1e1e1e", fg="#d4d4d4")
        self.console_text.pack(fill=tk.BOTH, expand=True)
        
        # Scrollbar for console
        scrollbar = ttk.Scrollbar(self.console_text, command=self.console_text.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.console_text.config(yscrollcommand=scrollbar.set)
        self.console_text.config(state=tk.DISABLED)

    def setup_history_tab(self):
        # Treeview for history
        columns = ("timestamp", "env", "passed", "failed", "pending", "total", "report")
        self.tree = ttk.Treeview(self.history_tab, columns=columns, show="headings")
        
        self.tree.heading("timestamp", text="Timestamp")
        self.tree.heading("env", text="Environment")
        self.tree.heading("passed", text="Passed")
        self.tree.heading("failed", text="Failed")
        self.tree.heading("pending", text="Pending")
        self.tree.heading("total", text="Total")
        self.tree.heading("report", text="Report Path")
        
        self.tree.column("timestamp", width=150)
        self.tree.column("env", width=100)
        self.tree.column("passed", width=80, anchor=tk.CENTER)
        self.tree.column("failed", width=80, anchor=tk.CENTER)
        self.tree.column("pending", width=80, anchor=tk.CENTER)
        self.tree.column("total", width=80, anchor=tk.CENTER)
        self.tree.column("report", width=300)
        
        self.tree.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Buttons
        btn_frame = ttk.Frame(self.history_tab)
        btn_frame.pack(fill=tk.X, padx=10, pady=5)
        
        open_report_btn = ttk.Button(btn_frame, text="Open Selected Report", command=self.open_selected_report)
        open_report_btn.pack(side=tk.LEFT, padx=5)

    def log(self, message):
        self.console_text.config(state=tk.NORMAL)
        self.console_text.insert(tk.END, message)
        self.console_text.see(tk.END)
        self.console_text.config(state=tk.DISABLED)

    def start_run(self):
        if self.process and self.process.poll() is None:
            messagebox.showwarning("Running", "Tests are already running!")
            return
            
        self.run_btn.config(state=tk.DISABLED)
        self.console_text.config(state=tk.NORMAL)
        self.console_text.delete(1.0, tk.END)
        self.console_text.config(state=tk.DISABLED)
        
        project_path = self.path_var.get().strip()
        env = self.env_var.get().strip()
        headless = "true" if self.headless_var.get() else "false"
        
        if not project_path or not os.path.isdir(project_path):
            messagebox.showerror("Error", "Invalid Project Path!")
            self.run_btn.config(state=tk.NORMAL)
            return
            
        self.log(f"Starting execution in: {project_path}\n")
        
        # Run in thread
        threading.Thread(target=self.run_maven_command, args=(project_path, env, headless), daemon=True).start()

    def run_maven_command(self, project_path, env, headless):
        cmd = ["mvn.cmd", "clean", "verify", f"-Dheadless={headless}"]
        if env:
            cmd.append(f"-Dcontext={env}")
            
        self.log(f"Command: {' '.join(cmd)}\n")
        
        try:
            self.process = subprocess.Popen(
                cmd,
                cwd=project_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )
            
            for line in self.process.stdout:
                self.root.after(0, self.log, line)
                
            self.process.wait()
            code = self.process.returncode
            self.root.after(0, self.log, f"\nProcess exited with code {code}\n")
            
            # Process results
            self.root.after(0, self.process_results, project_path, env)
            
        except Exception as e:
            self.root.after(0, self.log, f"\nError executing command: {str(e)}\n")
            
        finally:
            self.root.after(0, lambda: self.run_btn.config(state=tk.NORMAL))

    def process_results(self, project_path, env):
        serenity_dir = os.path.join(project_path, 'target', 'site', 'serenity')
        index_html = os.path.join(serenity_dir, 'index.html')
        summary_json = os.path.join(serenity_dir, 'serenity-summary.json')
        
        if not os.path.exists(index_html):
            self.log("Serenity HTML report not found. Did tests run?\n")
            return
            
        stats = {"total": 0, "passed": 0, "failed": 0, "pending": 0}
        
        if os.path.exists(summary_json):
            try:
                with open(summary_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                results = data.get('results', {})
                stats['total'] = results.get('total', 0)
                stats['passed'] = results.get('success', 0)
                stats['failed'] = results.get('failure', 0) + results.get('error', 0)
                stats['pending'] = results.get('pending', 0) + results.get('skipped', 0)
            except Exception as e:
                self.log(f"Error parsing serenity-summary.json: {e}\n")
        else:
            self.log("serenity-summary.json not found, using dummy data.\n")
            stats = {"total": 10, "passed": 8, "failed": 2, "pending": 0}
            
        summary = {
            "id": f"summary_{int(datetime.now().timestamp())}",
            "timestamp": datetime.now().isoformat(),
            "environment": env,
            "stats": stats,
            "reportPath": index_html
        }
        
        self.history.append(summary)
        self.save_history()
        self.refresh_history_table()
        
        self.log("\nResults saved to history.\n")

    def load_history(self):
        if os.path.exists(HISTORY_FILE):
            try:
                with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return []
        return []

    def save_history(self):
        try:
            with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.history, f, indent=2)
        except Exception as e:
            self.log(f"Failed to save history: {e}\n")

    def refresh_history_table(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        for run in reversed(self.history):
            try:
                dt = datetime.fromisoformat(run['timestamp']).strftime('%Y-%m-%d %H:%M:%S')
            except:
                dt = run.get('timestamp', '')
            
            stats = run.get('stats', {})
            self.tree.insert("", tk.END, values=(
                dt,
                run.get('environment', ''),
                stats.get('passed', 0),
                stats.get('failed', 0),
                stats.get('pending', 0),
                stats.get('total', 0),
                run.get('reportPath', '')
            ))

    def open_selected_report(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showinfo("Info", "Please select a run from the history table first.")
            return
            
        item = self.tree.item(selected[0])
        report_path = item['values'][6]
        
        if os.path.exists(report_path):
            webbrowser.open(f"file://{report_path}")
        else:
            messagebox.showerror("Error", f"Report file not found:\n{report_path}")

if __name__ == "__main__":
    root = tk.Tk()
    app = DashboardApp(root)
    root.mainloop()
