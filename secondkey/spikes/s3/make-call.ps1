# S3: generate the DISCLOSED SYNTHETIC demo call with Windows' built-in TTS voices (no cloning of any
# real person; "Danny" and "Rose" are fictional). Writes call.wav plus the exact script as ground truth.
#   powershell -File secondkey/spikes/s3/make-call.ps1
Add-Type -AssemblyName System.Speech
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = @(
  @{ speaker = "Danny (synthetic voice)"; voice = "Microsoft David Desktop"; text = "Grandma? It's me, Danny. I'm in real trouble. I got arrested after a car accident." },
  @{ speaker = "Rose (synthetic voice)"; voice = "Microsoft Zira Desktop"; text = "Danny? You sound different." },
  @{ speaker = "Danny (synthetic voice)"; voice = "Microsoft David Desktop"; text = "My nose is broken, that's why. Please, I need eighteen hundred dollars for bail right now, or they keep me overnight." },
  @{ speaker = "Danny (synthetic voice)"; voice = "Microsoft David Desktop"; text = "And please don't tell Mom. She'll kill me. Promise you won't tell her." }
)
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = 0
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile((Join-Path $dir "call.wav"), $fmt)
$pb = New-Object System.Speech.Synthesis.PromptBuilder
foreach ($line in $script) {
  $pb.StartVoice($line.voice); $pb.AppendText($line.text); $pb.EndVoice(); $pb.AppendBreak([TimeSpan]::FromMilliseconds(700))
}
$s.Speak($pb)
$s.Dispose()
$truth = $script | ForEach-Object { [ordered]@{ speaker = $_.speaker; text = $_.text } }
$truth | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $dir "call-script.json")
Write-Output "wrote call.wav and call-script.json"
