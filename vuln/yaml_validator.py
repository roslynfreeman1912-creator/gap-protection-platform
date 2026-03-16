import yaml
from pathlib import Path

def validate_yaml(file_path):
    try:
        with open(file_path, 'r') as f:
            yaml.safe_load(f)
        return True
    except yaml.parser.ParserError as e:
        print(f"YAML-Fehler in {file_path}:")
        print(str(e))
        return False
    except Exception as e:
        print(f"Allgemeiner Fehler in {file_path}:")
        print(str(e))
        return False

def fix_yaml_indentation(file_path):
    """Automatische Einzugs-Korrektur"""
    with open(file_path, 'r') as f:
        lines = f.readlines()
    
    fixed_lines = []
    indent = 0
    for line in lines:
        stripped = line.strip()
        if stripped.endswith(':'):
            fixed_lines.append(' ' * indent + stripped)
            indent += 2
        else:
            fixed_lines.append(' ' * indent + stripped)
            if indent > 0 and not line.strip().startswith('-'):
                indent -= 2
    
    with open(file_path, 'w') as f:
        f.write('\n'.join(fixed_lines))

if __name__ == '__main__':
    target_file = r'C:\projects\vuln\vuln\New folder\vuln\html.yaml'
    if not validate_yaml(target_file):
        print("Versuche automatische Reparatur...")
        fix_yaml_indentation(target_file)
        if validate_yaml(target_file):
            print("Erfolgreich repariert!")
        else:
            print("Manuelle Überprüfung erforderlich")
