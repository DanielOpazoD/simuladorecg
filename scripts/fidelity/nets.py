"""Redes 1D compartidas por el discriminador real/sintético y el clasificador diagnóstico."""
import torch
from torch import nn


class Block(nn.Module):
    def __init__(self, cin, cout, stride):
        super().__init__()
        self.conv1 = nn.Conv1d(cin, cout, 7, stride, 3, bias=False)
        self.bn1 = nn.BatchNorm1d(cout)
        self.conv2 = nn.Conv1d(cout, cout, 7, 1, 3, bias=False)
        self.bn2 = nn.BatchNorm1d(cout)
        self.skip = nn.Sequential() if cin == cout and stride == 1 else nn.Sequential(nn.Conv1d(cin, cout, 1, stride, bias=False), nn.BatchNorm1d(cout))

    def forward(self, x):
        y = torch.relu(self.bn1(self.conv1(x)))
        return torch.relu(self.bn2(self.conv2(y)) + self.skip(x))


class ResNet1d(nn.Module):
    """ResNet 1D pequeña: 12 derivaciones → n salidas (logits)."""

    def __init__(self, n_out, width=48, stem_stride=2):
        super().__init__()
        self.stem = nn.Sequential(nn.Conv1d(12, width, 15, stem_stride, 7, bias=False), nn.BatchNorm1d(width), nn.ReLU())
        chans = [width, width, 2 * width, 2 * width, 4 * width]
        self.blocks = nn.Sequential(*[Block(chans[i], chans[i + 1], 2) for i in range(len(chans) - 1)])
        self.head = nn.Linear(2 * chans[-1], n_out)

    def forward(self, x):
        y = self.blocks(self.stem(x))
        return self.head(torch.cat([y.mean(-1), y.amax(-1)], 1))


def device():
    return torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
