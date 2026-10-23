Option Explicit
Dim shell, fileSystem, toolsDir, installDir, logDir, logPath, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
toolsDir = fileSystem.GetParentFolderName(WScript.ScriptFullName)
installDir = fileSystem.GetParentFolderName(toolsDir)
logDir = installDir & "\logs"
If Not fileSystem.FolderExists(logDir) Then fileSystem.CreateFolder(logDir)
logPath = logDir & "\bridge.log"
shell.CurrentDirectory = installDir
shell.Environment("PROCESS")("FASTLOOK_POS_CONFIG") = installDir & "\config.json"
command = shell.ExpandEnvironmentStrings("%COMSPEC%") & " /d /c " & Chr(34) & Chr(34) & installDir & "\runtime\node.exe" & Chr(34) & " " & Chr(34) & installDir & "\app\server.js" & Chr(34) & " >> " & Chr(34) & logPath & Chr(34) & " 2>&1" & Chr(34)
shell.Run command, 0, False
