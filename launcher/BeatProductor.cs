// Lançador do Beat Productor (gera o BeatProductor.exe da raiz do projeto).
//
// Duplo clique e pronto:
//   1. encontra o Python 3.10+ e cria o ambiente .venv (primeira vez);
//   2. instala/atualiza as dependências só quando backend/requirements.txt muda;
//   3. escolhe uma porta livre (8000 a 8020), sobe o servidor e abre o navegador;
//   4. fechar a janela ou apertar Ctrl+C encerra o servidor.
//
// Opções: --port N  --no-browser  --no-pause  --help
// Compilação: launcher\build.ps1 (usa o csc.exe do .NET Framework, presente em todo Windows).
// Código compatível com C# 5 (o compilador que acompanha o .NET Framework 4.x).

using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

[assembly: AssemblyTitle("Beat Productor")]
[assembly: AssemblyDescription("Inicia o Beat Productor e abre o navegador")]
[assembly: AssemblyProduct("Beat Productor")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace BeatProductor
{
    internal sealed class LauncherException : Exception
    {
        public LauncherException(string message) : base(message) { }
    }

    internal static class Launcher
    {
        private const string Host = "127.0.0.1";
        private const int FirstPort = 8000;
        private const int LastPort = 8020;
        private const int StartupTimeoutSeconds = 60;
        private const string PythonDownloadUrl = "https://www.python.org/downloads/";

        private static Process server;
        private static volatile bool stopping;

        private static int Main(string[] args)
        {
            try { Console.OutputEncoding = Encoding.UTF8; } catch (IOException) { }
            Console.Title = "Beat Productor";

            bool openBrowser = true;
            bool pauseOnError = true;
            int requestedPort = 0;
            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i].ToLowerInvariant();
                if (arg == "--no-browser") openBrowser = false;
                else if (arg == "--no-pause") pauseOnError = false;
                else if (arg == "--port" && i + 1 < args.Length && int.TryParse(args[i + 1], out requestedPort) && requestedPort > 0 && requestedPort < 65536) i++;
                else if (arg == "--help" || arg == "-h" || arg == "/?")
                {
                    Console.WriteLine("Uso: BeatProductor.exe [--port N] [--no-browser] [--no-pause]");
                    return 0;
                }
                else
                {
                    Fail("Opção inválida: " + args[i] + "  (use --help)");
                    Pause(pauseOnError);
                    return 2;
                }
            }

            AppDomain.CurrentDomain.ProcessExit += delegate { StopServer(); };
            Console.CancelKeyPress += OnCancelKeyPress;

            try
            {
                return Run(requestedPort, openBrowser, pauseOnError);
            }
            catch (LauncherException ex)
            {
                Fail(ex.Message);
            }
            catch (Exception ex)
            {
                Fail("Erro inesperado: " + ex);
            }
            StopServer();
            Pause(pauseOnError);
            return 1;
        }

        private static int Run(int requestedPort, bool openBrowser, bool pauseOnError)
        {
            string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            string backend = Path.Combine(root, "backend");
            if (!File.Exists(Path.Combine(backend, Path.Combine("app", "main.py"))) ||
                !File.Exists(Path.Combine(root, Path.Combine("frontend", "index.html"))))
            {
                throw new LauncherException(
                    "Arquivos do projeto não encontrados em:\n  " + root +
                    "\nO BeatProductor.exe precisa ficar na pasta raiz do projeto (junto de backend\\ e frontend\\).");
            }

            Banner();

            // Já está rodando? Só abre o navegador.
            int probePort = requestedPort > 0 ? requestedPort : FirstPort;
            if (IsBeatProductor(probePort))
            {
                string runningUrl = Url(probePort);
                Ok("O Beat Productor já está rodando em " + runningUrl);
                if (openBrowser) OpenBrowser(runningUrl);
                Thread.Sleep(2500);
                return 0;
            }

            string python = EnsureVirtualEnv(root);
            EnsureDependencies(python, root);
            int port = ChoosePort(requestedPort);
            string url = Url(port);

            Step("Iniciando o servidor na porta " + port + " ...");
            ProcessStartInfo info = new ProcessStartInfo(python,
                "-m uvicorn app.main:app --app-dir " + Quote(backend) +
                " --host " + Host + " --port " + port + " --log-level warning");
            info.UseShellExecute = false;
            info.WorkingDirectory = root;
            server = Process.Start(info);

            DateTime deadline = DateTime.UtcNow.AddSeconds(StartupTimeoutSeconds);
            while (!IsBeatProductor(port))
            {
                if (server.HasExited)
                    throw new LauncherException("O servidor encerrou durante a inicialização (código " + server.ExitCode + "). Veja as mensagens acima.");
                if (DateTime.UtcNow > deadline)
                    throw new LauncherException("O servidor não respondeu em " + StartupTimeoutSeconds + " s.");
                Thread.Sleep(300);
            }

            Console.WriteLine();
            Ok("Beat Productor rodando em " + url);
            Console.WriteLine("   Para encerrar: feche esta janela ou aperte Ctrl+C.");
            Console.WriteLine();
            if (openBrowser) OpenBrowser(url);

            server.WaitForExit();
            int code = server.ExitCode;
            if (stopping || code == 0)
            {
                Ok("Servidor encerrado.");
                return 0;
            }
            Fail("O servidor parou inesperadamente (código " + code + ").");
            Pause(pauseOnError);
            return code;
        }

        // ------------------------------------------------------------------ Python e dependências

        private static string EnsureVirtualEnv(string root)
        {
            string venv = Path.Combine(root, ".venv");
            string venvPython = Path.Combine(venv, Path.Combine("Scripts", "python.exe"));

            if (File.Exists(venvPython))
            {
                if (PythonVersion(venvPython, "") != null) return venvPython;
                Warn("O ambiente .venv está quebrado (pasta movida ou Python atualizado). Recriando ...");
            }

            string[] basePython = FindBasePython();
            if (basePython == null)
            {
                throw new LauncherException(
                    "Python 3.10 ou mais novo não foi encontrado.\n" +
                    "  1. Instale em " + PythonDownloadUrl + "\n" +
                    "  2. Na instalação, marque \"Add Python to PATH\".\n" +
                    "  3. Abra o BeatProductor.exe de novo.");
            }

            Step("Criando o ambiente Python (.venv) — só na primeira vez ...");
            string arguments = (basePython[1] + " -m venv --clear " + Quote(venv)).Trim();
            if (RunVisible(basePython[0], arguments, root) != 0 || !File.Exists(venvPython))
                throw new LauncherException("Não foi possível criar o ambiente .venv.");
            return venvPython;
        }

        /// <returns>{ executável, argumentos iniciais } ou null.</returns>
        private static string[] FindBasePython()
        {
            string[][] candidates =
            {
                new[] { "py", "-3" },
                new[] { "python", "" },
                new[] { "python3", "" },
            };
            foreach (string[] candidate in candidates)
            {
                Version version = PythonVersion(candidate[0], candidate[1]);
                if (version != null && version >= new Version(3, 10)) return candidate;
            }
            return null;
        }

        private static Version PythonVersion(string executable, string prefixArgs)
        {
            string output;
            int code = RunCapture(executable, (prefixArgs + " -c \"import sys; print('%d.%d' % sys.version_info[:2])\"").Trim(), 20000, out output);
            Version version;
            if (code == 0 && Version.TryParse(output.Trim(), out version)) return version;
            return null;
        }

        private static void EnsureDependencies(string python, string root)
        {
            string requirements = Path.Combine(root, Path.Combine("backend", "requirements.txt"));
            string stamp = Path.Combine(root, Path.Combine(".venv", ".beatproductor-deps"));
            string hash = Sha256(requirements);

            if (File.Exists(stamp) && File.ReadAllText(stamp).Trim() == hash)
            {
                Step("Dependências OK.");
                return;
            }

            Step("Instalando dependências (precisa de internet; pode levar alguns minutos) ...");
            string arguments = "-m pip install --disable-pip-version-check -r " + Quote(requirements);
            if (RunVisible(python, arguments, root) != 0)
                throw new LauncherException("Falha ao instalar as dependências. Verifique a conexão com a internet e tente de novo.");
            File.WriteAllText(stamp, hash);
        }

        // ------------------------------------------------------------------ rede

        private static string Url(int port)
        {
            return "http://" + Host + ":" + port + "/";
        }

        private static bool IsBeatProductor(int port)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(Url(port) + "api/health");
                request.Proxy = null;
                request.Timeout = 1500;
                using (WebResponse response = request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    string body = reader.ReadToEnd();
                    return body.Contains("\"status\":\"ok\"") && body.Contains("\"instruments\"");
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        private static int ChoosePort(int requestedPort)
        {
            if (requestedPort > 0)
            {
                if (!IsPortFree(requestedPort))
                    throw new LauncherException("A porta " + requestedPort + " está em uso por outro programa. Escolha outra com --port.");
                return requestedPort;
            }
            for (int port = FirstPort; port <= LastPort; port++)
            {
                if (IsPortFree(port))
                {
                    if (port != FirstPort) Warn("Porta " + FirstPort + " ocupada; usando " + port + ".");
                    return port;
                }
            }
            throw new LauncherException("Nenhuma porta livre entre " + FirstPort + " e " + LastPort + ".");
        }

        private static bool IsPortFree(int port)
        {
            // Alguém já atende nessa porta?
            using (TcpClient client = new TcpClient())
            {
                try
                {
                    IAsyncResult attempt = client.BeginConnect(IPAddress.Loopback, port, null, null);
                    if (attempt.AsyncWaitHandle.WaitOne(300) && client.Connected) return false;
                }
                catch (SocketException) { }
            }
            // E conseguimos reservá-la?
            try
            {
                TcpListener listener = new TcpListener(IPAddress.Loopback, port);
                listener.ExclusiveAddressUse = true;
                listener.Start();
                listener.Stop();
                return true;
            }
            catch (SocketException)
            {
                return false;
            }
        }

        private static void OpenBrowser(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception)
            {
                Warn("Não consegui abrir o navegador. Abra manualmente: " + url);
            }
        }

        // ------------------------------------------------------------------ processos

        private static int RunVisible(string file, string arguments, string workingDirectory)
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(file, arguments);
                info.UseShellExecute = false;
                info.WorkingDirectory = workingDirectory;
                using (Process process = Process.Start(info))
                {
                    process.WaitForExit();
                    return process.ExitCode;
                }
            }
            catch (System.ComponentModel.Win32Exception)
            {
                return -1;
            }
        }

        private static int RunCapture(string file, string arguments, int timeoutMs, out string output)
        {
            output = "";
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(file, arguments);
                info.UseShellExecute = false;
                info.RedirectStandardOutput = true;
                info.RedirectStandardError = true;
                info.CreateNoWindow = true;
                using (Process process = Process.Start(info))
                {
                    process.ErrorDataReceived += delegate { };
                    process.BeginErrorReadLine();
                    output = process.StandardOutput.ReadToEnd();
                    if (!process.WaitForExit(timeoutMs))
                    {
                        try { process.Kill(); } catch (Exception) { }
                        return -1;
                    }
                    return process.ExitCode;
                }
            }
            catch (Exception)
            {
                return -1; // executável inexistente etc.
            }
        }

        private static void OnCancelKeyPress(object sender, ConsoleCancelEventArgs e)
        {
            if (server == null || server.HasExited) return; // sem servidor: deixa fechar
            e.Cancel = true; // o Python também recebe o Ctrl+C e encerra sozinho
            if (stopping)
            {
                StopServer(); // segundo Ctrl+C: força
                return;
            }
            stopping = true;
            Console.WriteLine();
            Step("Encerrando o servidor ...");
        }

        private static void StopServer()
        {
            try
            {
                if (server != null && !server.HasExited) server.Kill();
            }
            catch (Exception) { }
        }

        // ------------------------------------------------------------------ utilitários

        private static string Quote(string path)
        {
            return "\"" + path + "\"";
        }

        private static string Sha256(string path)
        {
            using (SHA256 sha = SHA256.Create())
            using (FileStream stream = File.OpenRead(path))
            {
                return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "");
            }
        }

        private static void Banner()
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine();
            Console.WriteLine("  == BEAT PRODUCTOR ==");
            Console.WriteLine();
            Console.ResetColor();
        }

        private static void Step(string message) { Write(ConsoleColor.Gray, "-> " + message); }
        private static void Ok(string message) { Write(ConsoleColor.Green, "OK " + message); }
        private static void Warn(string message) { Write(ConsoleColor.Yellow, "!  " + message); }
        private static void Fail(string message) { Console.WriteLine(); Write(ConsoleColor.Red, "ERRO: " + message); }

        private static void Write(ConsoleColor color, string message)
        {
            Console.ForegroundColor = color;
            Console.WriteLine(message);
            Console.ResetColor();
        }

        private static void Pause(bool enabled)
        {
            if (!enabled || Console.IsInputRedirected) return;
            Console.WriteLine();
            Console.Write("Pressione Enter para fechar...");
            Console.ReadLine();
        }
    }
}
