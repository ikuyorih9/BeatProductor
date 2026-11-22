// Lançador do Beat Productor (gera o BeatProductor.exe da raiz do projeto).
//
// Duplo clique e pronto:
//   1. encontra um Python compatível (3.12 a 3.14, 64 bits) e cria o ambiente .venv (primeira vez).
//      Se a máquina não tiver um, baixa o instalador oficial do python.org (hash conferido) e instala
//      o Python só para o Beat Productor, sem administrador e sem mexer no PATH;
//   2. instala/atualiza as dependências só quando backend/requirements.txt muda;
//   3. escolhe uma porta livre (8000 a 8020), sobe o servidor e abre o navegador;
//      o servidor aceita conexões da rede local (0.0.0.0), então o celular no mesmo Wi-Fi também abre;
//   4. fechar a janela ou apertar Ctrl+C encerra o servidor.
//
// Opções: --port N  --local  --no-browser  --no-pause  --install-python  --help
// Compilação: launcher\build.ps1 (usa o csc.exe do .NET Framework, presente em todo Windows).
// Código compatível com C# 5 (o compilador que acompanha o .NET Framework 4.x).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Microsoft.Win32;

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
        // Endereço que o próprio computador usa para falar com o servidor (navegador, checagens).
        private const string LocalHost = "127.0.0.1";
        // Onde o servidor escuta: 0.0.0.0 = todas as interfaces (outros aparelhos do Wi-Fi alcançam);
        // com --local, só o próprio computador.
        private static string bindHost = "0.0.0.0";
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
            bool forceInstall = false;
            int requestedPort = 0;
            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i].ToLowerInvariant();
                if (arg == "--no-browser") openBrowser = false;
                else if (arg == "--no-pause") pauseOnError = false;
                else if (arg == "--install-python") forceInstall = true;
                else if (arg == "--local") bindHost = LocalHost;
                else if (arg == "--port" && i + 1 < args.Length && int.TryParse(args[i + 1], out requestedPort) && requestedPort > 0 && requestedPort < 65536) i++;
                else if (arg == "--help" || arg == "-h" || arg == "/?")
                {
                    Console.WriteLine("Uso: BeatProductor.exe [--port N] [--local] [--no-browser] [--no-pause] [--install-python]");
                    Console.WriteLine("  --local           aceita conexões só deste computador (sem acesso pelo Wi-Fi)");
                    Console.WriteLine("  --install-python  ignora os Pythons do sistema e usa (instalando se preciso) o Python próprio do Beat Productor");
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
                return Run(requestedPort, openBrowser, pauseOnError, forceInstall);
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

        private static int Run(int requestedPort, bool openBrowser, bool pauseOnError, bool forceInstall)
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

            string python = EnsureVirtualEnv(root, forceInstall);
            EnsureDependencies(python, root);
            int port = ChoosePort(requestedPort);
            string url = Url(port);

            Step("Iniciando o servidor na porta " + port + " ...");
            ProcessStartInfo info = new ProcessStartInfo(python,
                "-m uvicorn app.main:app --app-dir " + Quote(backend) +
                " --host " + bindHost + " --port " + port + " --log-level warning");
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
            if (bindHost != LocalHost) ShowNetworkAccess(port);
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

        // Faixa de Python suportada: as versões fixadas em backend/requirements.txt têm pacotes prontos
        // (wheels) para 3.12, 3.13 e 3.14. Fora dela o pip não acha versão ("could not find a version that
        // satisfies the requirement ..."). Mantenha em sincronia com backend/pyproject.toml e scripts/run.*.
        private static readonly Version MinPython = new Version(3, 12);
        private static readonly Version MaxPython = new Version(3, 14);
        private const string SupportedRange = "3.12 a 3.14, 64 bits";

        // Python instalado automaticamente quando a máquina não tem um compatível: instalador oficial,
        // só para o usuário atual (sem administrador), numa pasta própria e sem mexer no PATH.
        private const string BundledPythonVersion = "3.13.14";
        private const string BundledPythonUrl = "https://www.python.org/ftp/python/3.13.14/python-3.13.14-amd64.exe";
        private const string BundledPythonSha256 = "C54D9B9BBB8A36E6489363DDD01139707FD781D72F1F9E90C7EC65D0061368E0";

        private sealed class PythonInfo
        {
            public Version Version;
            public int Bits;
            public bool FreeThreaded;

            public bool Supported
            {
                get { return Version >= MinPython && Version <= MaxPython && Bits == 64 && !FreeThreaded; }
            }

            public override string ToString()
            {
                return Version + " (" + Bits + " bits" + (FreeThreaded ? ", free-threaded" : "") + ")";
            }
        }

        private static string BeatProductorDataDir()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BeatProductor");
        }

        private static string BundledPythonDir()
        {
            return Path.Combine(BeatProductorDataDir(), "Python313");
        }

        private static string EnsureVirtualEnv(string root, bool forceInstall)
        {
            string venv = Path.Combine(root, ".venv");
            string venvPython = Path.Combine(venv, Path.Combine("Scripts", "python.exe"));

            if (File.Exists(venvPython) && !forceInstall)
            {
                PythonInfo current = ProbePython(venvPython, "");
                if (current != null && current.Supported) return venvPython;
                if (current == null)
                    Warn("O ambiente .venv está quebrado (pasta movida ou Python desinstalado). Recriando ...");
                else
                    Warn("O ambiente .venv foi criado com o Python " + current + ", fora da faixa suportada (" +
                         SupportedRange + "). Recriando ...");
            }

            string[] basePython = forceInstall ? null : FindBasePython();
            if (basePython == null)
            {
                InstallBundledPython();
                basePython = FindBasePython();
                if (basePython == null)
                {
                    throw new LauncherException(
                        "O Python foi instalado, mas não consegui usá-lo.\n" +
                        "Instale manualmente o Python " + BundledPythonVersion + " (64 bits) em " + PythonDownloadUrl +
                        " e abra o BeatProductor.exe de novo.");
                }
            }

            Step("Criando o ambiente Python (.venv) — só na primeira vez ...");
            string arguments = (basePython[1] + " -m venv --clear " + Quote(venv)).Trim();
            if (RunVisible(basePython[0], arguments, root) != 0 || !File.Exists(venvPython))
                throw new LauncherException("Não foi possível criar o ambiente .venv.");
            return venvPython;
        }

        /// <returns>{ executável, argumentos iniciais } de um Python da faixa suportada, ou null.</returns>
        private static string[] FindBasePython()
        {
            List<string[]> candidates = new List<string[]>();
            candidates.Add(new[] { Path.Combine(BundledPythonDir(), "python.exe"), "" });
            foreach (string exe in RegisteredPythons()) candidates.Add(new[] { exe, "" });
            for (int minor = MinPython.Minor; minor <= MaxPython.Minor; minor++)
                candidates.Add(new[] { "py", "-3." + minor });
            candidates.Add(new[] { "python", "" });
            candidates.Add(new[] { "python3", "" });

            List<string> rejected = new List<string>();
            foreach (string[] candidate in candidates)
            {
                if (Path.IsPathRooted(candidate[0]) && !File.Exists(candidate[0])) continue;
                PythonInfo info = ProbePython(candidate[0], candidate[1]);
                if (info == null) continue;
                if (info.Supported)
                {
                    Step("Usando o Python " + info + ": " + (candidate[0] + " " + candidate[1]).Trim());
                    return candidate;
                }
                string description = info.ToString();
                if (!rejected.Contains(description)) rejected.Add(description);
            }
            if (rejected.Count > 0)
                Warn("Python encontrado, mas fora da faixa suportada (" + SupportedRange + "): " + string.Join(", ", rejected.ToArray()));
            return null;
        }

        /// <summary>Pythons registrados no Windows (PEP 514), de instalações por usuário e para todos.</summary>
        private static List<string> RegisteredPythons()
        {
            List<string> found = new List<string>();
            RegistryHive[] hives = { RegistryHive.CurrentUser, RegistryHive.LocalMachine };
            RegistryView[] views = { RegistryView.Registry64, RegistryView.Registry32 };
            foreach (RegistryHive hive in hives)
            {
                foreach (RegistryView view in views)
                {
                    try
                    {
                        using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hive, view))
                        using (RegistryKey core = baseKey.OpenSubKey(@"Software\Python\PythonCore"))
                        {
                            if (core == null) continue;
                            foreach (string tag in core.GetSubKeyNames())
                            {
                                using (RegistryKey install = core.OpenSubKey(tag + @"\InstallPath"))
                                {
                                    if (install == null) continue;
                                    string exe = install.GetValue("ExecutablePath") as string;
                                    if (string.IsNullOrEmpty(exe))
                                    {
                                        string dir = install.GetValue("") as string;
                                        if (!string.IsNullOrEmpty(dir)) exe = Path.Combine(dir, "python.exe");
                                    }
                                    if (string.IsNullOrEmpty(exe) || !File.Exists(exe)) continue;
                                    string normalized = Path.GetFullPath(exe);
                                    if (!found.Exists(delegate(string f) { return string.Equals(f, normalized, StringComparison.OrdinalIgnoreCase); }))
                                        found.Add(normalized);
                                }
                            }
                        }
                    }
                    catch (Exception) { } // chave inacessível: ignora
                }
            }
            return found;
        }

        private static PythonInfo ProbePython(string executable, string prefixArgs)
        {
            const string script =
                "import sys, struct, sysconfig, venv; " +
                "print('%d.%d %d %d' % (sys.version_info[0], sys.version_info[1], struct.calcsize('P') * 8, " +
                "1 if sysconfig.get_config_var('Py_GIL_DISABLED') else 0))";
            string output;
            int code = RunCapture(executable, (prefixArgs + " -c \"" + script + "\"").Trim(), 20000, out output);
            if (code != 0) return null;
            string[] parts = output.Trim().Split(' ');
            Version version;
            int bits;
            if (parts.Length != 3 || !Version.TryParse(parts[0], out version) || !int.TryParse(parts[1], out bits)) return null;
            PythonInfo info = new PythonInfo();
            info.Version = version;
            info.Bits = bits;
            info.FreeThreaded = parts[2] == "1";
            return info;
        }

        private static void InstallBundledPython()
        {
            if (!Environment.Is64BitOperatingSystem)
                throw new LauncherException("O Beat Productor precisa de um Windows de 64 bits.");

            string target = BundledPythonDir();
            string downloads = Path.Combine(BeatProductorDataDir(), "downloads");
            Directory.CreateDirectory(downloads);
            string installer = Path.Combine(downloads, "python-" + BundledPythonVersion + "-amd64.exe");
            string log = Path.Combine(downloads, "python-install.log");

            Console.WriteLine();
            Warn("Nenhum Python compatível (" + SupportedRange + ") foi encontrado neste computador.");
            Step("Instalando o Python " + BundledPythonVersion + " só para o Beat Productor — automático, sem administrador.");
            Console.WriteLine("   Pasta: " + target);
            Console.WriteLine("   (não altera o PATH nem outros Pythons; dá para remover em Configurações > Aplicativos)");

            if (!File.Exists(installer) || !string.Equals(Sha256(installer), BundledPythonSha256, StringComparison.OrdinalIgnoreCase))
            {
                Step("Baixando o instalador oficial de python.org ...");
                string partial = installer + ".part";
                Download(BundledPythonUrl, partial);
                string hash = Sha256(partial);
                if (!string.Equals(hash, BundledPythonSha256, StringComparison.OrdinalIgnoreCase))
                {
                    TryDelete(partial);
                    throw new LauncherException(
                        "O instalador do Python baixado não confere (download corrompido ou interceptado).\n" +
                        "Tente de novo; se persistir, instale o Python " + BundledPythonVersion + " em " + PythonDownloadUrl + ".");
                }
                TryDelete(installer);
                File.Move(partial, installer);
            }

            Step("Instalando o Python " + BundledPythonVersion + " (cerca de 1 minuto) ...");
            string arguments =
                "/quiet InstallAllUsers=0 PrependPath=0 Include_launcher=0 InstallLauncherAllUsers=0 " +
                "Shortcuts=0 AssociateFiles=0 Include_doc=0 Include_test=0 Include_tcltk=0 Include_pip=1 " +
                "TargetDir=" + Quote(target) + " /log " + Quote(log);
            int code = RunVisible(installer, arguments, downloads);
            if (code != 0 && code != 3010) // 3010 = sucesso, reinicialização recomendada
            {
                throw new LauncherException(
                    "A instalação automática do Python falhou (código " + code + ").\n" +
                    "  Detalhes: " + log + "\n" +
                    "  Alternativa: instale o Python " + BundledPythonVersion + " (64 bits) em " + PythonDownloadUrl +
                    " e abra o BeatProductor.exe de novo.");
            }
            TryDelete(installer);
            Ok("Python " + BundledPythonVersion + " instalado.");
        }

        private static void Download(string url, string destination)
        {
            // O .NET Framework antigo usa TLS 1.0 por padrão; o python.org exige TLS 1.2+.
            try { ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072; } catch (NotSupportedException) { }
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 30000;
                request.ReadWriteTimeout = 60000;
                request.UserAgent = "BeatProductor-launcher";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (Stream input = response.GetResponseStream())
                using (FileStream output = File.Create(destination))
                {
                    long total = response.ContentLength;
                    long done = 0;
                    int lastPercent = -1;
                    byte[] buffer = new byte[81920];
                    int read;
                    while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        output.Write(buffer, 0, read);
                        done += read;
                        if (total <= 0) continue;
                        int percent = (int)(done * 100 / total);
                        if (percent == lastPercent) continue;
                        lastPercent = percent;
                        Console.Write("\r   " + percent + "% de " + (total / (1024 * 1024)) + " MB   ");
                    }
                }
                Console.WriteLine();
            }
            catch (Exception ex)
            {
                if (!(ex is WebException) && !(ex is IOException)) throw;
                Console.WriteLine();
                TryDelete(destination);
                throw new LauncherException(
                    "Não consegui baixar o Python (" + ex.Message + ").\n" +
                    "Verifique a conexão com a internet e abra o BeatProductor.exe de novo.");
            }
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
            // --only-binary: só pacotes prontos (nunca tenta compilar código C na máquina do usuário).
            string arguments = "-m pip install --disable-pip-version-check --only-binary :all: --retries 5 --timeout 60 -r " + Quote(requirements);
            if (RunVisible(python, arguments, root) != 0)
                throw new LauncherException("Falha ao instalar as dependências. Verifique a conexão com a internet e tente de novo.");
            File.WriteAllText(stamp, hash);
        }

        // ------------------------------------------------------------------ rede

        private static string Url(int port)
        {
            return "http://" + LocalHost + ":" + port + "/";
        }

        /// <summary>Mostra o link para abrir em outro aparelho do Wi-Fi e avisa se a rede está como Pública.</summary>
        private static void ShowNetworkAccess(int port)
        {
            List<string> ips = LanAddresses();
            if (ips.Count > 0)
            {
                Ok("No celular (ou outro aparelho no mesmo Wi-Fi), abra:");
                foreach (string ip in ips) Write(ConsoleColor.Green, "     http://" + ip + ":" + port + "/");
            }
            else
            {
                Warn("Não encontrei o IP deste computador na rede; veja o \"Endereço IPv4\" no comando ipconfig.");
            }

            List<string> publicNetworks = PublicNetworks();
            if (publicNetworks.Count > 0)
            {
                Warn("A rede \"" + string.Join("\", \"", publicNetworks.ToArray()) + "\" está como Pública: o firewall do Windows");
                Warn("bloqueia os outros aparelhos. Para liberar, mude para Privada em Configurações > Rede e Internet.");
            }
            Console.WriteLine("   Se o Windows perguntar, permita o acesso do Python só em Redes privadas.");
            Console.WriteLine("   Para não aceitar conexões da rede, abra com --local.");
        }

        /// <summary>IPv4 das placas ligadas e conectadas a um roteador (ignora as virtuais do Docker/WSL).</summary>
        private static List<string> LanAddresses()
        {
            List<string> result = new List<string>();
            try
            {
                foreach (NetworkInterface nic in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (nic.OperationalStatus != OperationalStatus.Up || nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    IPInterfaceProperties props = nic.GetIPProperties();
                    bool hasGateway = false;
                    foreach (GatewayIPAddressInformation gateway in props.GatewayAddresses)
                    {
                        if (gateway.Address.AddressFamily == AddressFamily.InterNetwork && !gateway.Address.Equals(IPAddress.Any)) hasGateway = true;
                    }
                    if (!hasGateway) continue;
                    foreach (UnicastIPAddressInformation address in props.UnicastAddresses)
                    {
                        if (address.Address.AddressFamily == AddressFamily.InterNetwork) result.Add(address.Address.ToString());
                    }
                }
            }
            catch (NetworkInformationException) { }
            return result;
        }

        /// <summary>Nomes das redes conectadas marcadas como Públicas (via NetworkListManager do Windows).</summary>
        private static List<string> PublicNetworks()
        {
            List<string> result = new List<string>();
            try
            {
                Type managerType = Type.GetTypeFromCLSID(new Guid("DCB00C01-570F-4A9B-8D69-199FDBA5723B"));
                object manager = Activator.CreateInstance(managerType);
                const int ConnectedNetworks = 1; // NLM_ENUM_NETWORK_CONNECTED
                object networks = managerType.InvokeMember("GetNetworks", BindingFlags.InvokeMethod, null, manager, new object[] { ConnectedNetworks });
                foreach (object network in (System.Collections.IEnumerable)networks)
                {
                    Type t = network.GetType();
                    int category = (int)t.InvokeMember("GetCategory", BindingFlags.InvokeMethod, null, network, null);
                    if (category == 0) // NLM_NETWORK_CATEGORY_PUBLIC
                        result.Add((string)t.InvokeMember("GetName", BindingFlags.InvokeMethod, null, network, null));
                }
            }
            catch (Exception) { } // sem o serviço (raro): só deixa de avisar
            return result;
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
                TcpListener listener = new TcpListener(bindHost == LocalHost ? IPAddress.Loopback : IPAddress.Any, port);
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

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch (Exception) { }
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
