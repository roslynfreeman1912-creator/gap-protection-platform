import os
import yaml
from pathlib import Path

class VulnerabilityMerger:
    def __init__(self, base_dir: str):
        self.base_path = Path(base_dir)
        self.output_file = self.base_path / 'merged_vulnerabilities.yaml'
        
    def merge_files(self):
        merged_data = {'vulnerabilities': []}
        
        for yaml_file in self.base_path.glob('*.yaml'):
            if yaml_file.name != self.output_file.name:
                with open(yaml_file, 'r') as f:
                    data = yaml.safe_load(f)
                    if data and 'vulnerabilities' in data:
                        merged_data['vulnerabilities'].extend(data['vulnerabilities'])
        
        with open(self.output_file, 'w') as f:
            yaml.dump(merged_data, f, sort_keys=False)
        
        return str(self.output_file)

if __name__ == '__main__':
    merger = VulnerabilityMerger(r'C:\\projects\\vuln\\vuln\\New folder\\vuln')
    result_path = merger.merge_files()
    print(f"Konsolidierte Datei erstellt: {result_path}")
