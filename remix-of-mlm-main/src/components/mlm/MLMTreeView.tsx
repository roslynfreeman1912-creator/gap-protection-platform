import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, User, Users, CheckCircle, XCircle } from 'lucide-react';

export interface TreeNode {
  id: string;
  name: string;
  email?: string;
  partner_number?: string;
  status?: string;
  level: number;
  is_active?: boolean;
  children?: TreeNode[];
}

interface MLMTreeViewProps {
  data: TreeNode;
  maxExpandLevel?: number;
  onNodeClick?: (node: TreeNode) => void;
}

function TreeNodeItem({ 
  node, 
  depth = 0, 
  maxExpandLevel = 3,
  onNodeClick 
}: { 
  node: TreeNode; 
  depth?: number; 
  maxExpandLevel?: number;
  onNodeClick?: (node: TreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(depth < maxExpandLevel);
  const hasChildren = node.children && node.children.length > 0;

  const levelColors: Record<number, string> = {
    0: 'bg-primary text-primary-foreground',
    1: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300',
    2: 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300',
    3: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300',
    4: 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300',
    5: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300',
  };

  return (
    <div className="select-none">
      <div 
        className={cn(
          "flex items-center gap-2 py-2 px-3 rounded-lg transition-colors cursor-pointer",
          "hover:bg-muted/70",
          depth === 0 && "bg-primary/5 border border-primary/20"
        )}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          onNodeClick?.(node);
        }}
      >
        {/* Expand/Collapse toggle */}
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          )}
        </div>

        {/* Avatar */}
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
          depth === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}>
          {depth === 0 ? (
            <Users className="h-4 w-4" />
          ) : (
            <span>{node.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
          )}
        </div>

        {/* Name & Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{node.name || 'Unbekannt'}</span>
            {node.partner_number && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                #{node.partner_number}
              </Badge>
            )}
          </div>
          {node.email && (
            <p className="text-xs text-muted-foreground truncate">{node.email}</p>
          )}
        </div>

        {/* Level Badge */}
        <Badge 
          variant="outline" 
          className={cn("text-[10px] px-1.5 py-0 shrink-0", levelColors[Math.min(node.level, 5)])}
        >
          {node.level === 0 ? 'Root' : `L${node.level}`}
        </Badge>

        {/* Status */}
        {node.status && (
          node.status === 'active' ? (
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          )
        )}

        {/* Children count */}
        {hasChildren && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            {node.children!.length}
          </Badge>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className={cn("ml-6 pl-4 border-l-2 border-muted mt-1 space-y-0.5")}>
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              maxExpandLevel={maxExpandLevel}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MLMTreeView({ data, maxExpandLevel = 3, onNodeClick }: MLMTreeViewProps) {
  const [expandAll, setExpandAll] = useState(false);

  const countNodes = (node: TreeNode): number => {
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += countNodes(child);
      }
    }
    return count;
  };

  const totalNodes = countNodes(data);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalNodes} {totalNodes === 1 ? 'Mitglied' : 'Mitglieder'} in der Struktur
        </p>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setExpandAll(!expandAll)}
        >
          {expandAll ? 'Zuklappen' : 'Alles aufklappen'}
        </Button>
      </div>

      {/* Tree */}
      <div className="space-y-0.5">
        <TreeNodeItem
          node={data}
          depth={0}
          maxExpandLevel={expandAll ? 99 : maxExpandLevel}
          onNodeClick={onNodeClick}
        />
      </div>
    </div>
  );
}
