param(
 [Parameter(Mandatory=$true)][string]$Username,
 [Parameter(Mandatory=$true)][string]$DisplayName,
 [ValidateSet('recepcion','tecnico','administrador')][string]$Role='recepcion'
)
$ErrorActionPreference='Stop'
$secret=Read-Host 'Contraseña individual de 14 a 128 caracteres' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
 $env:REPARIX_USERNAME=$Username
 $env:REPARIX_NAME=$DisplayName
 $env:REPARIX_ROLE=$Role
 $env:REPARIX_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 node --env-file=.env scripts/create-user.mjs
 if($LASTEXITCODE -ne 0){throw 'No se creó la cuenta. Revisa los requisitos y el nombre de usuario.'}
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
 Remove-Item Env:REPARIX_USERNAME,Env:REPARIX_NAME,Env:REPARIX_ROLE,Env:REPARIX_PASSWORD -ErrorAction SilentlyContinue
}