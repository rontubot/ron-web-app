!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var PythonCheckbox        ; handle del checkbox
Var PythonInstallFlag     ; 1 = instalar Python, 0 = no

; ----- Se ejecuta al inicio del instalador -----
!macro customInit
  ; Por defecto: instalar Python
  StrCpy $PythonInstallFlag 1
!macroend

; ----- Se ejecuta justo antes de terminar la instalación -----
!macro customInstall
  ${If} $PythonInstallFlag == 1
    ; El instalador se ha copiado a:
    ;   $INSTDIR\python-installer\python-3.12.2.exe
    StrCpy $0 "$INSTDIR\python-installer\python-3.12.2.exe"

    DetailPrint "Buscando instalador de Python en: $0"

    ; Comprobar que el archivo realmente existe
    IfFileExists "$0" +3 0
      DetailPrint "❌ Instalador de Python NO encontrado en $0"
      MessageBox MB_ICONSTOP "No se encontró el instalador de Python en:$\r$\n$0"
      Goto donePython

    DetailPrint "✅ Instalador encontrado, iniciando instalación silenciosa de Python..."

    ; /passive para ver la ventana (para pruebas). Cambia a /quiet después si quieres full silencioso.
    ExecWait '"$0" /passive InstallAllUsers=0 PrependPath=1 Include_test=0' $1

    DetailPrint "Instalador de Python terminó con código: $1"

    ${If} $1 != 0
      MessageBox MB_ICONEXCLAMATION \
        "No se pudo instalar Python automáticamente (código: $1).$\r$\n\
Puedes instalarlo manualmente ejecutando:$\r$\n$0"
    ${EndIf}

    donePython:
  ${EndIf}
!macroend

; ----- Página extra con checkbox -----
!macro customInstallMode
  nsDialogs::Create 1018
  Pop $0
  ${IfThen} $0 == error ${|} Abort ${|}

  ${NSD_CreateCheckbox} 0 0 100% 12u "Instalar Python 3.12 (recomendado)"
  Pop $PythonCheckbox

  ; Estado inicial según $PythonInstallFlag
  ${If} $PythonInstallFlag == 1
    ${NSD_Check} $PythonCheckbox
  ${Else}
    ${NSD_Uncheck} $PythonCheckbox
  ${EndIf}

  nsDialogs::Show

  ${NSD_GetState} $PythonCheckbox $PythonInstallFlag
!macroend
